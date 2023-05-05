/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 04/05/2023
 **  @Description
 ***********************************************************/
import io, {Socket} from "socket.io";

const MemoryDatabase: { id: string; streamName: string; }[] = []

export class BrokerSocketServer {
	public socket: any;

	constructor(port: number = 3000) {
		this.socket = new io.Server().listen(port);
		console.log('My Socket', this.socket);
		this.socket.on('connection', (socket: Socket) => {
			console.debug('new service connected... waiting for authentication');
			socket.emit('identification', socket.id);
			socket.on('sign', this.sign);
			socket.on('disconnect', this.unsigned);
		});

	}

	get getStreamNames() {
		return MemoryDatabase.map((e: { id: string, streamName: string }) => e.streamName);
	}

	private sign(data: { id: string, streamName: string }) {
		console.log('Signing', data, MemoryDatabase);
		if (MemoryDatabase) {
			console.log('Entry', MemoryDatabase)
			const index = MemoryDatabase.findIndex((x) => {
				return x.streamName === data.streamName;
			});
			console.log('Index', index)
			if (index > -1) MemoryDatabase[index] = data;
			else MemoryDatabase.push(data);
		}
	}

	private unsigned(data: any) {
		const index = MemoryDatabase.findIndex((x) => {
			return x.id === data.id;
		});
		if (index > -1) MemoryDatabase.splice(index, 1);
	}

}
