/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import { EventStoreDBClient, IEvenStoreConfig } from "../core/global";
export interface IMethodFunctionResponse {
    data: any;
    ack: (requestId: string, method: string, payload: any, streamName: string, causationRoute: string[]) => void;
}
export declare type IMethodFunction<DataModel> = (data: DataModel | DataModel[], typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | string, streamName?: string, causationRoute?: string[]) => Promise<IMethodFunctionResponse>;
export declare type IContributor = {
    id_contact?: string;
    id_nowteam?: string;
    id_external?: string;
    lastname?: string;
    firstname?: string;
    account?: string;
    group?: string;
};
declare class EventsPlugin<DataModel> {
    create: IMethodFunction<DataModel>;
    update: IMethodFunction<DataModel>;
    delete: IMethodFunction<DataModel>;
    recover: IMethodFunction<DataModel>;
    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private readonly causationRoute;
    constructor(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]);
    private delivered;
    private EventMiddlewareEmitter;
    private appendToStream;
    private eventCompletedHandler;
    private readStreamConfig;
    private getMainStream;
    private processStateChecker;
    private template;
    private GenerateEventInternalId;
}
export default EventsPlugin;
