import { writable, get } from "svelte/store";
import { browser } from '$app/environment';
import dayjs from 'dayjs';

export const TRAILS = {
    PCT: {
        bounds: [
            [-123.8, 32.3],
            [-116.2, 49.2]
        ],
        size: '287 MB',
        sizeImages: '1 MB',
        sizeInBytes: 300000000
    },
    AT: {
        bounds: [
            [-84.4, 34.4],
            [-68.7, 46.1]
        ],
        size: '221 MB',
        sizeImages: '1 MB',
        sizeInBytes: 250000000
    },
    CDT: {
        bounds: [
            [-114.1, 31.1],
            [-105.5, 49.2]
        ],
        size: '284 MB',
        sizeImages: '1 MB',
        sizeInBytes: 300000000
    },
    test: {
        bounds: [
            [-117.0321, 42.0008],
            [-117.0263, 42.0048]
        ],
        size: '1 MB',
        sizeImages: '1 MB',
        sizeInBytes: 1000000
    },
};

export const ICONS = ['w', 's', 'c', 'o', 'j', 'r', 't', 'a'];

let initSettings = {
    trail: '',
    reverseMiles: false,
    offline: false,
    autosync: true,
    lastsync: {},
    offlineimages: false,
    enablesat: false,
    username: '',
    dark: true
}
if (browser) {
    const storedSettings = localStorage.getItem('settings')
    if (storedSettings) {
        initSettings = JSON.parse(storedSettings)
        initSettings.lastsync = new dayjs(initSettings.lastsync) //since its stored as a string
    }
    if (window.location.hostname.split('.')[0] === 'test') initSettings.trail = 'test'
}

export const settings = writable(initSettings)
if (browser && window.location.hostname.split('.')[0] !== 'test')
    settings.subscribe((val) => localStorage.setItem('settings', JSON.stringify(val)))

export const data = writable({
    type: 'FeatureCollection',
    features: []
})

export const trailRoute = writable({})

export const userMiles = writable({ miles: 0, date: new Date(0) })

export const renderedMarkers = writable([])

export const fragment = writable(new URLSearchParams(''))

function noOp() { }
export const modal = writable({ isOpen: false, type: '', data: '', spinner: false, submit: noOp, cancel: noOp })

export function openModal({ type = 'generic', data = '', spinner = false, submit = noOp, cancel = noOp } = {}) {
    if (type in get(settings)) { //convenience default to simplify settings screen:
        if (submit === noOp) submit = (data) => { settings.update((s) => { s[type] = data; return s }) }
        if (data === '') data = get(settings)[type];
    }
    modal.set({ isOpen: true, type: type, data: data, spinner: spinner, submit: submit, cancel: cancel })
}

export function errorModal(msg) {
    openModal({ type: 'error', data: msg })
}

export const bgFetchStatus = writable({ spinner: false, progress: 0 })