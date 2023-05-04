export declare class BrokerSocketServer {
    socket: any;
    private db;
    constructor(port?: number);
    get getStreamNames(): string[];
    private sign;
    private unsigned;
}
