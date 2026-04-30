import Dexie from 'dexie';

interface PendingItem {
	id?: number;
	route: string;
	data: unknown;
}

class MyDB extends Dexie {
	pending!: Dexie.Table<PendingItem, number>;

	constructor() {
		super('mydb');
		this.version(1).stores({
			pending: '++id, route, data'
		});
	}
}

export const db = new MyDB();
