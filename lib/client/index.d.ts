/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import { EventType } from "@eventstore/db-client";
import { EventStoreDBClient, IContributor, IEvenStoreConfig, IEventResponseError, IEventResponseSuccess } from "../core/global";
import { IEventCreate } from "../core/CommonResponse";
export interface IMethodFunctionResponse {
    data: IEventResponseSuccess<any> | IEventResponseError;
    request_id: string;
    error?: any;
    ack: () => (requestId: string, method: string, payload: any, streamName: string, causationRoute: string[]) => void;
}
export declare type IMethodFunction<Contributor, Type> = (data: ModelEventWrapper, contributor?: IContributor<Contributor>, typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | Type, streamName?: string, customs?: any, causationRoute?: string[]) => Promise<IMethodFunctionResponse>;
export interface ModelEventWrapper extends IEventCreate {
}
export declare const addContributor: (contributor?: IContributor<any>) => {
    account: any;
    group: any;
};
declare type IDataTreatedList = {
    id: string;
    event: EventType | 'pending';
    date: Date;
    causation: string | null;
};
declare type IDataTreatedListFoundResult = EventType | false | undefined;
/**
 *
 */
declare class DataTreated {
    QueueLimitRetry: number;
    IntervalClear: number;
    protected list: IDataTreatedList[];
    private _minutes;
    private clear_process;
    constructor();
    get clearTime(): number;
    exist(IdEvent: string): boolean;
    add(entry: IDataTreatedList): Promise<void>;
    find(IdEvent: string, catchStreamResult?: string | undefined | null, specificQuery?: any, retry?: number): Promise<IDataTreatedListFoundResult>;
    sleep(ms: number): Promise<unknown>;
    clearOldFile(): void;
}
declare class EventsPlugin<DataModel, Contributor> extends DataTreated {
    QueueLimitRetry: number;
    IntervalClear: number;
    create: IMethodFunction<DataModel, 'create'>;
    update: IMethodFunction<DataModel, 'update'>;
    delete: IMethodFunction<DataModel, 'delete'>;
    recover: IMethodFunction<DataModel, 'recover'>;
    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private _pendingTemplates;
    private readonly causationRoute;
    private stream;
    private streamCursor;
    private readonly group;
    constructor(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]);
    getStreamStatus(): any;
    private InitStreamWatcher;
    private SubscribeToPersistent;
    private CreatePersistentSubscription;
    private EventMiddlewareEmitter;
    private initAppendToStream;
    private appendToStream;
    private eventState;
    private template;
    private GenerateEventInternalId;
}
export default EventsPlugin;
