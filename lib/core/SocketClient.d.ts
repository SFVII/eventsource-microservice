export declare class BrokerSocketClient {
    private readonly io;
    private id;
    constructor(streamName: string, socketUrl: string, port?: string);
    set Id(data: string);
    get Id(): string;
    sign(socketId: string, streamName: any): void;
    unsigned(socketId: string): void;
    on(env: string, data: (msg: any) => any | void): void;
}
