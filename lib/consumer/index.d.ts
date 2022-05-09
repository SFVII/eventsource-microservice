/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import { IEvenStoreConfig, IEventHandlerGroup, IQueue, IQueueCustom, Method, MethodList, PersistentSubscription, StreamSubscription } from "../core/global";
declare class EventConsumer {
    QueueTTL: number;
    protected methods: Method;
    protected streamName: string;
    protected group: string;
    protected credentials: IEvenStoreConfig["credentials"];
    private eventEmitter;
    private client;
    private StartRevision;
    private stream;
    private readonly Queue;
    constructor(EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue?: IQueue | IQueueCustom, group?: IEventHandlerGroup);
    get subscription(): PersistentSubscription;
    exchange(stream: string, type: MethodList, data: any): void;
    on(key: 'ready' & MethodList, callback: (message: any) => void): void;
    AddToQueue(type: MethodList, ResolvedEvent: StreamSubscription, name?: string): void;
    handler(event: any, data: any, status?: string | null): Promise<void>;
    ack(event: any): Promise<void>;
    private init;
    private QueueListener;
    private SubscribeToPersistent;
    private template;
    private CreatePersistentSubscription;
}
export default EventConsumer;
