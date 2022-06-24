/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import { EventStoreDBClient, IEvenStoreConfig } from "../core/global";
interface IMethodFunctionResponse {
    data: any;
    ack: (requestId: string, method: string, payload: any, streamName: string, causationRoute: string[]) => void;
}
declare type IMethodFunction<DataModel> = (data: DataModel | DataModel[], streamName?: string, causationRoute?: string[], typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | string) => Promise<IMethodFunctionResponse>;
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
