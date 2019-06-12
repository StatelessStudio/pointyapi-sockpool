import 'jasmine';
import { sockpool, PointySockpool } from '../../src';
import { pointy, jwtBearer } from 'pointyapi';
import { addResource } from 'pointyapi/utils';
import { BaseUser, ExampleUser } from 'pointyapi/models';
import { UserRole } from 'pointyapi/enums';

import * as sockclient from 'socket.io-client';
const CLIENT_URL = 'http://localhost:8080';
const sockio = sockclient(CLIENT_URL);

const ROOT_PATH = require('app-root-path').toString();

describe('PointySockpool', () => {
	beforeAll(async () => {
		pointy.before = async (app) => {
			// Database
			await pointy.db.connect(ROOT_PATH);

			// User
			await addResource(ExampleUser, {
				fname: 'Drew',
				lname: 'Immerman',
				username: 'drewadmin',
				password: 'password123',
				email: 'drewadmin@test.com',
				role: UserRole.Admin
			});

			sockpool.registerEvents = (client) => {
				client.on('testrecv', (data) => client.emit('testsend'));
				client.on('pushtest', () => {
					sockpool.pushRaw(1, 'pushtest-complete');
				});
				client.on('basemodel', () => {
					const user = new ExampleUser();
					user.id = 2;
					user.username = 'test';
					sockpool.push(1, user);
				});
			};

			// Websocket
			sockpool.init();
		};

		// Start server
		await pointy.start();
	});

	it('can create a new instance', () => {
		const sp = new PointySockpool();
	});

	it('can connect', async () => {
		await new Promise((a, r) => {
			sockio.on('connect', () => a());
		});
	});

	it('can send/receive messages', async () => {
		const c = sockclient(CLIENT_URL);

		await new Promise((a, r) => {
			c.on('connect', () => {
				c.on('testsend', (data) => {
					a();
				});
				c.emit('testrecv', { hasData: true });
			});

			c.on('pushtest', () => c.emit('pushtest-complete'));
		});
	});

	it('can authenticate', async () => {
		const c = sockclient(CLIENT_URL);
		const user = new BaseUser();
		user.id = 1;

		await new Promise((a, r) => {
			c.on('connect', () => {
				c.emit('auth', {
					userid: 1,
					token: jwtBearer.sign(user)
				});

				c.on('auth-success', () => a());
				c.on('auth-fail', () => r());
			});
		});
	});

	it('checks the token', async () => {
		const c = sockclient(CLIENT_URL);
		const user = new BaseUser();
		user.id = 1;

		await new Promise((a, r) => {
			c.on('connect', () => {
				c.emit('auth', {
					userid: 1,
					token: 'wrong'
				});

				c.on('auth-success', () => r());
				c.on('auth-fail', () => a());
			});
		});
	});

	it('requires token id & user id to match', async () => {
		const c = sockclient(CLIENT_URL);
		const user = new BaseUser();
		user.id = 1;

		await new Promise((a, r) => {
			c.on('connect', () => {
				c.emit('auth', {
					userid: 2,
					token: jwtBearer.sign(user)
				});

				c.on('auth-success', () => r());
				c.on('auth-fail', () => a());
			});
		});
	});

	it('can broadcast to multiple clients', async () => {
		const c1 = sockclient(CLIENT_URL);
		const c2 = sockclient(CLIENT_URL);
		const user = new BaseUser();
		user.id = 1;

		let isConnected1 = false;
		let isConnected2 = false;

		let hasResult1 = false;
		let hasResult2 = false;

		await new Promise((a, r) => {
			c1.on('connect', () => {
				c1.emit('auth', {
					userid: 1,
					token: jwtBearer.sign(user)
				});

				c1.on('auth-success', () => {
					isConnected1 = true;

					if (isConnected2) {
						// Both connected
						c1.emit('pushtest');
					}
				});
				c1.on('auth-fail', () => r());

				c1.on('pushtest-complete', () => {
					hasResult1 = true;

					if (hasResult2) {
						a();
					}
				});
			});

			c2.on('connect', () => {
				c2.emit('auth', {
					userid: 1,
					token: jwtBearer.sign(user)
				});

				c2.on('auth-success', () => {
					isConnected2 = true;

					if (isConnected1) {
						// Both connected
						c2.emit('pushtest');
					}
				});
				c2.on('auth-fail', () => r());

				c2.on('pushtest-complete', () => {
					hasResult2 = true;

					if (hasResult1) {
						a();
					}
				});
			});
		});
	});

	it('can push a BaseModel', async () => {
		const c = sockclient(CLIENT_URL);
		const user = new BaseUser();
		user.id = 1;

		await new Promise((a, r) => {
			c.on('connect', () => {
				c.emit('auth', {
					userid: 1,
					token: jwtBearer.sign(user)
				});

				c.on('auth-success', () => {
					c.on('ExampleUser', (data) => {
						expect(data.id).toBe(2);
						a();
					});

					c.emit('basemodel');
				});
			});
		});
	});
});
