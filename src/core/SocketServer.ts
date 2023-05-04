/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 04/05/2023
 **  @Description
 ***********************************************************/
import io, {Socket} from "socket.io";

export class BrokerSocketServer {
	public socket: any;
	private db:  { id: string, streamName: string }[] = [];

	constructor(port: number = 3000) {
		this.socket = new io.Server().listen(port);
		this.socket.on('connection', (socket: Socket) => {
			console.log('new service connected... waiting for authentication');
			socket.emit('identification', socket.id);
			socket.on('sign', this.sign);
			socket.on('disconnect', this.unsigned);
		});

	}

	get getStreamNames() {
		return this.db.map((e: { id: string, streamName: string }) => e.streamName);
	}

	private sign(data: { id: string, streamName: string }) {
		const index = this.db.findIndex((x) =>
		{if (x.streamName === data.streamName) return x});
		if (index > -1) this.db[index] = data;
		else this.db.push(data);
	}

	private unsigned(data: any) {
		const index = this.db.findIndex((x) => {if (x.id === data.id) return x});
		if (index > -1) this.db.splice(index, 1);
	}

}
