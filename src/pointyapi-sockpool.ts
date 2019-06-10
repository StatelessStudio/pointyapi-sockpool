import { PointyApi, pointy, jwtBearer } from 'pointyapi';
import { BaseModel, BaseUser } from 'pointyapi/models';

// Websocket
import * as socketio from 'socket.io';
import * as http from 'http';

/**
 * PointySockpool
 * 
 * Create a Websocket Server & User pool in PointyAPI
 */
export class PointySockpool {
	// App
	public pointyapi: PointyApi;
	public server: http.Server;
	public io: socketio.Socket;

	// Websocket pool
	public sockpool: Object = {};
	public nSocks: number = 0;

	/**
	 * Create a sockpool
	 * @param pointyapi PointyAPI instance to run on
	 */
	constructor(pointyapi: PointyApi = pointy) {
		this.pointyapi = pointyapi;
	}

	/**
	 * Initialize sockpool
	 */
	public init() {
		this.server = http.createServer(this.pointyapi.app);
		this.io = socketio(this.server);

		this.io.on('connection', (client) => {
			this.registerEvents(client);
			this.onConnection(client);
		});

		// Override pointy listen function
		this.pointyapi.listen = (app, port, log) => {
			// Startup Websocket Pool
			this.server.listen(port);
			console.log(`[SERVER] Listening on port ${port}`);
		};
	}

	public registerEvents(client) {}

	/**
	 * Event - Connection
	 * @param client Socket client
	 */
	public onConnection(client) {
		client.on('disconnect', (data) => {
			if (
				client &&
				'id' in client &&
				client.id &&
				client.id in this.sockpool
			) {
				delete this.sockpool[client.id];
				this.nSocks--;
			}
		});

		client.on('auth', async (auth) => {
			if (client && 'id' in client && client.id) {
				// Decode token
				const decoded = jwtBearer.dryVerify(auth.token);

				// Check token
				if (
					!('token' in auth) ||
					!jwtBearer.dryVerify(auth.token) ||
					!decoded.id ||
					decoded.id !== auth.userid
				) {
					// Token rejected
					client.emit('auth-fail');
					return;
				}

				// Find user
				const user: void | BaseUser = await this.pointyapi.db.conn
					.getRepository(this.pointyapi.userType)
					.findOne({ id: auth.userid })
					.catch((error) => {
						this.pointyapi.error(error);
						client.emit('error', 'Could not authenticate user');
					});

				// Check user
				if (!user) {
					// Couldn't find user
					client.emit('auth-fail');
					return;
				}

				// Add client to sockpool
				this.sockpool[client.id] = {
					user: user,
					socket: client
				};
				this.nSocks++;

				// Success
				client.emit('auth-success', { id: user.id });
			}
		});
	}

	/**
	 * Push an object to the user
	 */
	public push(userId: any, obj: BaseModel) {
		this.pushRaw(userId, obj.constructor.name, obj);
	}

	/**
	 * Push raw data to the user
	 */
	public pushRaw(userId: any, label: string, data?: any) {
		for (const sock in this.sockpool) {
			if (this.sockpool[sock].user.id === userId) {
				this.sockpool[sock].socket.emit(label, data);
			}
		}
	}
}

export const sockpool = new PointySockpool();
