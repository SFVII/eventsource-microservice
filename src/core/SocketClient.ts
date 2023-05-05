/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 04/05/2023
 **  @Description
 ***********************************************************/
import {io} from "socket.io-client";


export class BrokerSocketClient {
	private io: any;
	private id: string;

	constructor(socketUrl: string, port: number = 3000) {
		this.io = io(socketUrl, {
			reconnectionDelayMax: 10000,
			port: port
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

	on(env: string, data: () => any | void) {
		this.io.on(env, data);
	}
}
