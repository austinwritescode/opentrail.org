#!/usr/bin/env python3
"""Generate trail coordinate files with delta-encoded integer arrays.

Distance methods (tried in order of accuracy):
  1. M-value linear referencing (if shapefile has PolylineM measures)
  2. Geodesic (Vincenty) on WGS84 ellipsoid
  3. Albers Equal Area projected planar distance (US only)

If --known-distance is provided, the computed distance is scaled to match,
enabling correction for geometry simplification losses.

Elevation lookup via Google Maps Elevation API (requires --google-api-key).

Constants:
  POINTS_PER_MILE  point density (default 10, i.e. 0.1-mile spacing)
  COORD_PRECISION  decimal places for integer encoding (default 4, ~11m)

Output format (lossless, delta-encoded integer arrays):
  p:     coordinate precision (lat/lon multiplied by 10^p)
  lons:  first value = lon * 10^p, rest = delta from previous
  lats:  first value = lat * 10^p, rest = delta from previous
  elevs: first value = elevation in meters, rest = delta from previous
"""

import argparse
import json
import math
import sys
import time
import zipfile
from pathlib import Path

import gpxpy
import numpy as np
import requests
import shapefile
from geographiclib.geodesic import Geodesic
from pyproj import Geod, Transformer
from shapely.geometry import LineString, MultiLineString, shape

METERS_PER_MILE = 1609.344
GEOD = Geodesic.WGS84
PYPROJ_GEOD = Geod(ellps="WGS84")

GOOGLE_ELEV_URL = "https://maps.googleapis.com/maps/api/elevation/json"
GOOGLE_ELEV_BATCH = 512
GOOGLE_ELEV_MAX_URL_SIZE = 16384

POINTS_PER_MILE = 10
COORD_PRECISION = 4
GAP_WARN_METERS = 0.1 * METERS_PER_MILE


def _warn_coordinate_gaps(coords):
    if len(coords) < 2:
        return
    gap_count = 0
    worst_m = 0.0
    for i in range(1, len(coords)):
        _, _, d = PYPROJ_GEOD.inv(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1])
        if d > GAP_WARN_METERS:
            gap_count += 1
            if d > worst_m:
                worst_m = d
    if gap_count:
        print(f"  WARNING: {gap_count} coordinate gap(s) > 0.1 mi detected (max {worst_m:.0f}m / {worst_m / METERS_PER_MILE:.1f} mi). Source data may have discontinuities.", file=sys.stderr)


def parse_gpx(path: Path):
    with open(path, encoding="utf-8") as f:
        gpx = gpxpy.parse(f)
    coords = []
    for track in gpx.tracks:
        for segment in track.segments:
            for pt in segment.points:
                coords.append((pt.longitude, pt.latitude))
    for route in gpx.routes:
        for pt in route.points:
            coords.append((pt.longitude, pt.latitude))
    if not coords:
        for waypoint in gpx.waypoints:
            coords.append((waypoint.longitude, waypoint.latitude))
    return coords


def parse_geojson(path: Path):
    with open(path, encoding="utf-8") as f:
        data = json.load(f)
    geom = shape(data if "coordinates" in data else data.get("geometry", data))
    coords = []
    if isinstance(geom, LineString):
        coords = [(c[0], c[1]) for c in geom.coords]
    elif isinstance(geom, MultiLineString):
        for line in geom.geoms:
            coords.extend([(c[0], c[1]) for c in line.coords])
    else:
        raise ValueError(f"Unsupported geometry type: {type(geom).__name__}")
    return coords


def parse_shapefile_coords(path: Path):
    base = str(path)
    if base.lower().endswith(".shp"):
        base = base[:-4]
    sf = shapefile.Reader(base)

    feature_data = []
    for i in range(len(sf)):
        shp = sf.shape(i)
        pts = shp.points
        mvals = shp.m

        has_m = mvals is not None and any(m is not None for m in mvals)

        part_starts = list(shp.parts) + [len(pts)]
        part_coords = []
        for p in range(len(part_starts) - 1):
            start = part_starts[p]
            end = part_starts[p + 1]
            part_pts = [(pt[0], pt[1]) for pt in pts[start:end]]
            if len(part_pts) >= 2:
                part_coords.append(part_pts)

        if not part_coords:
            continue

        if has_m:
            first_valid_m = None
            for m in mvals:
                if m is not None:
                    first_valid_m = float(m)
                    break
            feature_data.append((first_valid_m, part_coords))
        else:
            feature_data.append((float("inf"), part_coords))

    if not feature_data:
        return []

    feature_data.sort(key=lambda x: x[0] if x[0] is not None else float("inf"))

    coords = []
    for _, part_coords in feature_data:
        for part in part_coords:
            if coords and abs(part[0][0] - coords[-1][0]) < 1e-10 and abs(part[0][1] - coords[-1][1]) < 1e-10:
                coords.extend(part[1:])
            else:
                coords.extend(part)

    return coords


def check_shapefile_m_values(path: Path):
    base = str(path)
    if base.lower().endswith(".shp"):
        base = base[:-4]
    sf = shapefile.Reader(base)
    if sf.shapeTypeName not in ("POLYLINEM", "POLYLINEZ"):
        return None

    features = []
    for i in range(len(sf)):
        shp = sf.shape(i)
        pts = shp.points
        mvals = shp.m
        if mvals is None:
            return None
        has_any_m = any(m is not None for m in mvals)
        if not has_any_m:
            return None
        part_starts = list(shp.parts) + [len(pts)]
        for p in range(len(part_starts) - 1):
            start = part_starts[p]
            end = part_starts[p + 1]
            part_pts = pts[start:end]
            part_m = mvals[start:end]
            features.append((part_pts, part_m))

    return features


def _parse_kml_coordinates(text):
    coords = []
    for token in text.strip().split():
        parts = token.split(",")
        if len(parts) >= 2:
            try:
                coords.append((float(parts[0]), float(parts[1])))
            except ValueError:
                continue
    return coords


def parse_kmz(path: Path, name_filter=None):
    import xml.etree.ElementTree as ET

    with zipfile.ZipFile(path) as zf:
        kml_names = [n for n in zf.namelist() if n.lower().endswith(".kml")]
        if not kml_names:
            raise ValueError("No .kml file found inside KMZ archive")
        with zf.open(kml_names[0]) as kf:
            tree = ET.parse(kf)

    ns = ""
    root = tree.getroot()
    tag = root.tag
    if tag.startswith("{"):
        ns = tag[: tag.index("}") + 1]

    coords = []
    for pm in root.iter(f"{ns}Placemark"):
        name_elem = pm.find(f"{ns}name")
        pm_name = name_elem.text.strip() if name_elem is not None and name_elem.text else ""
        if name_filter is not None and pm_name.lower() != name_filter.lower():
            continue
        for coord_elem in pm.iter(f"{ns}coordinates"):
            parsed = _parse_kml_coordinates(coord_elem.text or "")
            if len(parsed) >= 2:
                coords.extend(parsed)

    if not coords:
        if name_filter:
            raise ValueError(f"No features matched name filter: {name_filter!r}")
        raise ValueError("No coordinates found in KMZ/KML")
    return coords


def parse_track(path: Path, name_filter=None):
    suffix = path.suffix.lower()
    if suffix == ".gpx":
        return parse_gpx(path)
    if suffix in (".geojson", ".json"):
        return parse_geojson(path)
    if suffix == ".shp":
        return parse_shapefile_coords(path)
    if suffix == ".kmz":
        return parse_kmz(path, name_filter=name_filter)
    raise ValueError(f"Unsupported file format: {suffix}")


# ---------------------------------------------------------------------------
# Method 1: M-value linear referencing
# ---------------------------------------------------------------------------

def interpolate_m_values(features, interval_miles):
    sorted_features = sorted(features, key=lambda f: f[1][0] if f[1][0] is not None else float("inf"))

    all_mile_coords = []

    for pts, mvals in sorted_features:
        cleaned = []
        for pt, m in zip(pts, mvals):
            if m is not None:
                cleaned.append((pt[0], pt[1], float(m)))
        if len(cleaned) < 2:
            continue

        m_start = cleaned[0][2]
        m_end = cleaned[-1][2]

        if m_start <= 0.0 and m_end >= 0.0:
            all_mile_coords.append((0.0, cleaned[0][0], cleaned[0][1]))

        target_m = math.ceil(m_start / interval_miles) * interval_miles
        if target_m < m_start:
            target_m += interval_miles

        idx = 0
        while target_m <= m_end + 1e-9:
            while idx < len(cleaned) - 1 and cleaned[idx + 1][2] < target_m - 1e-12:
                idx += 1

            if idx >= len(cleaned) - 1:
                break

            lon0, lat0, m0 = cleaned[idx]
            lon1, lat1, m1 = cleaned[idx + 1]

            if m1 == m0:
                target_m += interval_miles
                continue

            t = (target_m - m0) / (m1 - m0)
            lon = lon0 + t * (lon1 - lon0)
            lat = lat0 + t * (lat1 - lat0)

            all_mile_coords.append((round(target_m, 1), lon, lat))
            target_m += interval_miles

    all_mile_coords.sort(key=lambda x: x[0])
    deduped = []
    seen = set()
    for mile, lon, lat in all_mile_coords:
        key = round(mile, 1)
        if key not in seen:
            seen.add(key)
            deduped.append((mile, lon, lat))

    return deduped


# ---------------------------------------------------------------------------
# Method 2: Geodesic (Vincenty)
# ---------------------------------------------------------------------------

def compute_cumulative_geodesic(coords):
    if not coords:
        return []

    n = len(coords)
    lons1 = np.array([c[0] for c in coords[:-1]], dtype=np.float64)
    lats1 = np.array([c[1] for c in coords[:-1]], dtype=np.float64)
    lons2 = np.array([c[0] for c in coords[1:]], dtype=np.float64)
    lats2 = np.array([c[1] for c in coords[1:]], dtype=np.float64)

    batch_size = 50000
    all_az1s = []
    all_dists = []
    for start in range(0, n - 1, batch_size):
        end = min(start + batch_size, n - 1)
        az1s, _, dists = PYPROJ_GEOD.inv(
            lons1[start:end], lats1[start:end],
            lons2[start:end], lats2[start:end],
        )
        all_az1s.append(az1s)
        all_dists.append(dists)

    az1s = np.concatenate(all_az1s)
    dists = np.concatenate(all_dists)
    cum_dists = np.cumsum(dists)
    cum_dists = np.insert(cum_dists, 0, 0.0)

    result = []
    for i in range(n):
        az = float(az1s[i - 1]) if i > 0 else 0.0
        result.append((float(cum_dists[i]), coords[i][0], coords[i][1], az))

    return result


def _bisect_cum_dist(cum_dist, target_meters):
    lo, hi = 0, len(cum_dist) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if cum_dist[mid][0] < target_meters:
            lo = mid + 1
        else:
            hi = mid
    return max(lo, 1)


def interpolate_geodesic_at_distance(cum_dist, target_meters):
    idx = _bisect_cum_dist(cum_dist, target_meters)
    s0, lon0, lat0, _ = cum_dist[idx - 1]
    s1, lon1, lat1, azi = cum_dist[idx]

    if s1 != s0:
        t = (target_meters - s0) / (s1 - s0)
        ds = target_meters - s0
        if ds < 1e-6:
            return lon0, lat0
        r = GEOD.Direct(lat0, lon0, azi, ds)
        if "lon2" in r and "lat2" in r:
            return r["lon2"], r["lat2"]
        return lon0 + t * (lon1 - lon0), lat0 + t * (lat1 - lat0)

    return lon0, lat0


def interpolate_geodesic_points(cum_dist, interval_miles, known_distance_miles=None):
    if not cum_dist:
        return []
    total_meters = cum_dist[-1][0]
    interval_meters = interval_miles * METERS_PER_MILE

    scale = 1.0
    if known_distance_miles is not None:
        computed_miles = total_meters / METERS_PER_MILE
        if computed_miles > 0:
            scale = known_distance_miles / computed_miles

    points = []
    d = 0.0
    while d <= total_meters + 1e-6:
        mile = (d / METERS_PER_MILE) * scale
        if d <= total_meters:
            lon, lat = interpolate_geodesic_at_distance(cum_dist, d)
            points.append((round(mile, 1), lon, lat))
        d += interval_meters

    last_mile = (total_meters / METERS_PER_MILE) * scale
    if points and points[-1][0] < round(last_mile, 1) - 0.01:
        lon, lat = interpolate_geodesic_at_distance(cum_dist, total_meters)
        points.append((round(last_mile, 1), lon, lat))

    return points


# ---------------------------------------------------------------------------
# Method 3: Albers Equal Area projection
# ---------------------------------------------------------------------------

def compute_cumulative_albers(coords):
    try:
        transformer_fwd = Transformer.from_crs("EPSG:4326", "ESRI:102003", always_xy=True)
    except Exception:
        print("Warning: ESRI:102003 not available, skipping Albers method", file=sys.stderr)
        return None

    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    xs, ys = transformer_fwd.transform(lons, lats)

    cum_dist = []
    cum = 0.0
    cum_dist.append((cum, lons[0], lats[0]))
    for i in range(1, len(coords)):
        dx = xs[i] - xs[i - 1]
        dy = ys[i] - ys[i - 1]
        d = math.sqrt(dx * dx + dy * dy)
        cum += d
        cum_dist.append((cum, lons[i], lats[i]))

    return cum_dist


def interpolate_albers_at_distance(cum_dist, target_meters):
    idx = _bisect_cum_dist(cum_dist, target_meters)
    s0, lon0, lat0 = cum_dist[idx - 1]
    s1, lon1, lat1 = cum_dist[idx]

    if s1 == s0:
        return lon0, lat0
    t = (target_meters - s0) / (s1 - s0)
    return lon0 + t * (lon1 - lon0), lat0 + t * (lat1 - lat0)


def interpolate_albers_points(cum_dist, interval_miles, known_distance_miles=None):
    if not cum_dist:
        return []
    total_meters = cum_dist[-1][0]
    interval_meters = interval_miles * METERS_PER_MILE

    scale = 1.0
    if known_distance_miles is not None:
        computed_miles = total_meters / METERS_PER_MILE
        if computed_miles > 0:
            scale = known_distance_miles / computed_miles

    points = []
    d = 0.0
    while d <= total_meters + 1e-6:
        mile = (d / METERS_PER_MILE) * scale
        if d <= total_meters:
            lon, lat = interpolate_albers_at_distance(cum_dist, d)
            points.append((round(mile, 1), lon, lat))
        d += interval_meters

    last_mile = (total_meters / METERS_PER_MILE) * scale
    if points and points[-1][0] < round(last_mile, 1) - 0.01:
        lon, lat = interpolate_albers_at_distance(cum_dist, total_meters)
        points.append((round(last_mile, 1), lon, lat))

    return points


# ---------------------------------------------------------------------------
# Elevation lookup
# ---------------------------------------------------------------------------

def _encoded_url_len(s):
    return len(s) + 2 * sum(1 for c in s if c in ',|')


def lookup_elevations_google(points, api_key):
    results = []
    total = len(points)
    idx = 0
    api_calls = 0

    while idx < total:
        batch = []
        base_len = len(GOOGLE_ELEV_URL) + len("?locations=") + len("&key=") + len(api_key)
        url_len = base_len

        while idx < total and len(batch) < GOOGLE_ELEV_BATCH:
            p = points[idx]
            entry = f"{round(p[2], 6)},{round(p[1], 6)}"
            added_len = _encoded_url_len(entry) + (3 if batch else 0)
            if url_len + added_len > GOOGLE_ELEV_MAX_URL_SIZE and batch:
                break
            batch.append(p)
            url_len += added_len
            idx += 1

        locations = "|".join(f"{round(p[2], 6)},{round(p[1], 6)}" for p in batch)

        params = {
            "locations": locations,
            "key": api_key,
        }

        for attempt in range(5):
            api_calls += 1
            resp = requests.get(GOOGLE_ELEV_URL, params=params, timeout=30)
            if resp.status_code == 200:
                break
            if resp.status_code == 429:
                wait = 2 ** attempt
                print(f"  Rate limited, waiting {wait}s...", file=sys.stderr)
                time.sleep(wait)
            else:
                resp.raise_for_status()
        else:
            resp.raise_for_status()

        data = resp.json()
        if data.get("status") != "OK":
            raise RuntimeError(f"Google Elevation API error: {data.get('status')} {data.get('error_message', '')}")

        elev_results = data.get("results", [])
        for j, p in enumerate(batch):
            if j < len(elev_results):
                elev_m = elev_results[j].get("elevation", 0.0)
                elev_m_rounded = round(elev_m)
            else:
                elev_m_rounded = 0
            results.append((p[0], p[1], p[2], elev_m_rounded))

        if idx < total:
            time.sleep(0.05)

    return results, api_calls


# ---------------------------------------------------------------------------
# Output
# ---------------------------------------------------------------------------

def build_output(points, precision=COORD_PRECISION, has_elevation=False):
    scale = 10 ** precision
    lons_i = [int(round(p[1] * scale)) for p in points]
    lats_i = [int(round(p[2] * scale)) for p in points]

    lon_deltas = [lons_i[0]] + [lons_i[i] - lons_i[i - 1] for i in range(1, len(lons_i))]
    lat_deltas = [lats_i[0]] + [lats_i[i] - lats_i[i - 1] for i in range(1, len(lats_i))]

    result = {
        "p": precision,
        "lons": lon_deltas,
        "lats": lat_deltas,
    }

    if has_elevation:
        elevs = [p[3] for p in points]
        elev_deltas = [elevs[0]] + [elevs[i] - elevs[i - 1] for i in range(1, len(elevs))]
        result["elevs"] = elev_deltas

    return result


def main():
    parser = argparse.ArgumentParser(
        description="Generate trail coordinate files with delta-encoded integer arrays.\n\n"
        "Distance methods (auto-selected):\n"
        "  1. M-value linear referencing (shapefile with PolylineM)\n"
        "  2. Geodesic (Vincenty) on WGS84\n"
        "  3. Albers Equal Area projected planar (US only)\n\n"
        "Use --method to force a specific method.\n"
        "Use --known-distance to scale computed distance to an official total.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("input", type=Path, help="Input shapefile (.shp), GPX, GeoJSON, or KMZ")
    parser.add_argument("-o", "--output", type=Path, default=None, help="Output JSON file")
    parser.add_argument(
        "--method",
        choices=["auto", "m_value", "geodesic", "albers"],
        default="auto",
        help="Distance calculation method (default: auto)",
    )
    parser.add_argument(
        "--known-distance",
        type=float,
        default=None,
        help="Official total trail distance in miles (for scaling correction)",
    )
    parser.add_argument(
        "--google-api-key",
        type=str,
        default=None,
        help="Google Maps API key for elevation lookup",
    )
    parser.add_argument(
        "--name-filter",
        type=str,
        default=None,
        help="Only include features whose name matches exactly (case-insensitive)",
    )
    args = parser.parse_args()

    if not args.input.exists():
        parser.error(f"Input file not found: {args.input}")

    if args.output is None:
        args.output = args.input.with_name(args.input.stem + "_trail.json")

    interval_miles = 1.0 / POINTS_PER_MILE
    method_used = args.method
    points = None

    # --- Try M-value method ---
    if args.method in ("auto", "m_value") and args.input.suffix.lower() == ".shp":
        print("Checking for M-values in shapefile...", file=sys.stderr)
        m_features = check_shapefile_m_values(args.input)
        if m_features is not None:
            print(f"  Found M-values! Using linear referencing ({len(m_features)} features)", file=sys.stderr)
            points = interpolate_m_values(m_features, interval_miles)
            method_used = "m_value"

            total_mi = points[-1][0] if points else 0.0
            print(f"  Total M-value distance: {total_mi:.4f} miles", file=sys.stderr)

            if args.known_distance is not None:
                official = args.known_distance
                diff = total_mi - official
                print(f"  Official distance: {official:.4f} miles (diff: {diff:+.4f})", file=sys.stderr)
        elif args.method == "m_value":
            parser.error("No M-values found in shapefile; use --method auto or --method geodesic")
        else:
            print("  No M-values found, falling back to geodesic", file=sys.stderr)

    # --- Try geodesic method ---
    if points is None and args.method in ("auto", "geodesic"):
        print(f"Parsing track from {args.input}...", file=sys.stderr)
        coords = parse_track(args.input, name_filter=args.name_filter)
        print(f"  {len(coords)} coordinates", file=sys.stderr)
        _warn_coordinate_gaps(coords)

    if points is None and args.method in ("auto", "albers"):
        print(f"Parsing track from {args.input}...", file=sys.stderr)
        coords = parse_track(args.input, name_filter=args.name_filter)
        print(f"  {len(coords)} coordinates", file=sys.stderr)
        _warn_coordinate_gaps(coords)

        if len(coords) < 2:
            parser.error("Track must have at least 2 coordinates")

        print("Computing Albers Equal Area distances (ESRI:102003)...", file=sys.stderr)
        cum_alb = compute_cumulative_albers(coords)
        if cum_alb is None:
            parser.error("Albers projection not available")

        total_miles = cum_alb[-1][0] / METERS_PER_MILE
        print(f"  Total Albers distance: {total_miles:.4f} miles", file=sys.stderr)

        if args.known_distance is not None:
            scale = args.known_distance / total_miles if total_miles > 0 else 1.0
            print(f"  Scaling factor: {scale:.6f}", file=sys.stderr)
        print(f"Interpolating points at {interval_miles}-mile intervals ({POINTS_PER_MILE} per mile)...", file=sys.stderr)

        points = interpolate_albers_points(cum_alb, interval_miles, args.known_distance)
        method_used = "albers"
        if args.known_distance is not None:
            method_used = "albers_scaled"

    if points is None:
        parser.error("No distance method could be applied")

    # --- Elevation lookup ---
    has_elevation = False
    if args.google_api_key:
        print(f"Looking up elevations for {len(points)} points via Google Maps API...", file=sys.stderr)
        points, api_calls = lookup_elevations_google(points, args.google_api_key)
        has_elevation = True
        print(f"  Elevation lookup complete ({api_calls} API calls)", file=sys.stderr)

    # --- Build and write output ---
    print(f"  {len(points)} points generated (method: {method_used})", file=sys.stderr)

    output = build_output(points, precision=COORD_PRECISION, has_elevation=has_elevation)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(output, f, separators=(",", ":"))

    total_mi = points[-1][0] if points else 0.0
    print(f"Output written to {args.output}", file=sys.stderr)
    print(f"  Total miles: {total_mi:.4f}", file=sys.stderr)
    print(f"  Point count: {len(points)}", file=sys.stderr)
    print(f"  Method: {method_used}", file=sys.stderr)


if __name__ == "__main__":
    main()
