/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import { IEvenStoreConfig, IEventHandlerGroup, IQueue, IQueueCustom, Method, MethodList } from "../core/global";
import { JSONEventType, PersistentAction, PersistentSubscriptionToStream } from "@eventstore/db-client";
import { EventParser } from "../core/CommonResponse";
declare class EventConsumer<Contributor> {
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
    private readonly publish;
    private readonly settings;
    private readonly streamSettings;
    private readonly overridePublishName;
    private readonly StreamMaxAge;
    constructor(EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue?: IQueue | IQueueCustom, publish?: boolean, group?: IEventHandlerGroup, overridePublishName?: string);
    get subscription(): PersistentSubscriptionToStream;
    on(key: 'ready' & MethodList & string, callback: (message: JSONEventType[]) => any): void;
    AddToQueue(type: MethodList, ResolvedEvent: JSONEventType, name?: string): void;
    handler(eventParse: EventParser<any>): Promise<void>;
    ack(event: any): Promise<void>;
    nack(event: any, type?: PersistentAction, reason?: string): Promise<void>;
    retry(event: any, reason?: string): Promise<void>;
    private Merge;
    private init;
    private QueueListener;
    private SubscribeToPersistent;
    private template;
    private CreatePersistentSubscription;
}
export default EventConsumer;
