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

	constructor(streamName : string, socketUrl: string, port: number = 3000) {
		this.io = io(socketUrl + ':' + port, {
			reconnectionDelayMax: 10000
		});

		console.log('socket url', socketUrl + ':' + port)
		this.io.on('connect', (data: any) => {
			console.log('connect, DATA', data)
		});

		this.io.on('identification', (data:any) => {
			this.Id = data;
			console.debug('We are signing', this.Id, streamName)
			this.sign(this.Id, streamName)
		})
		console.log('this', this.io);
		this.io.on("disconnect", () => {
			console.log(this.io.id); // undefined
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
