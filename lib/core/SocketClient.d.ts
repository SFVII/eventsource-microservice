export declare class BrokerSocketClient {
    private readonly io;
    private id;
    constructor(socketUrl: string, port?: number);
    set Id(data: string);
    get Id(): string;
    sign(socketId: string, streamName: any): void;
    unsigned(socketId: string): void;
    on(env: string, data: (msg: any) => any | void): void;
}
