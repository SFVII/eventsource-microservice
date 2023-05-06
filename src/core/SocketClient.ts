/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 04/05/2023
 **  @Description
 ***********************************************************/
import {io} from "socket.io-client";


export class BrokerSocketClient {
	private readonly io: any;
	private id: string;

	constructor(streamName : string, socketUrl: string, port: string = '3000') {
		this.io = io(socketUrl, {
			reconnectionDelayMax: 10000,
			port : port
		}).connect();


		console.log('WTF ???? Hapenned here ?', this.io, socketUrl + ':' + port);


		this.io.on('connect', (data: any) => {
			console.log('connected to handler at: %s',  socketUrl + ':' + port)
		});

		this.io.on('identification', (data:any) => {
			this.Id = data;
			this.sign(this.Id, streamName)
		})
		this.io.on("onerror", (err:any) => {
			console.log(this.io.id); // undefined
			console.error('Socket on error we lost connexion with handler, we are rebooting for prevent error', err)
			process.exit(0)
		});
		this.io.on("disconnect", () => {
			console.log(this.io.id); // undefined
			console.error('Socket disconnected we lost connexion with handler, we are rebooting for prevent  error')
			process.exit(0)
		});
	}

	set Id(data: string) {
		this.id = data;
	}

	get Id() {
		return this.id
	}

	sign(socketId: string, streamName: any) {
		this.io.emit('sign', {id: socketId, streamName});
	}

	unsigned(socketId: string) {
		this.io.emit('unsigned', {id: socketId});
	}

	on(env: string, data: (msg:any) => any | void) {
		this.io.on(env, data);
	}
}
