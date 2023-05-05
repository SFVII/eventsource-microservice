export declare class BrokerSocketServer {
    socket: any;
    constructor(port?: number);
    get getStreamNames(): string[];
    private sign;
    private unsigned;
}
