/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import { EventStoreDBClient, IEvenStoreConfig } from "../core/global";
declare class EventsPlugin<DataModel> {
    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private StartRevision;
    private stream;
    private readonly causationRoute;
    constructor(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]);
    private delivered;
    private EventMiddlewareEmitter;
    private appendToStream;
    private eventCompletedHandler;
    private readStreamConfig;
    private getMainStream;
    private processStateChecker;
    private init;
    private template;
    private GenerateEventInternalId;
    private CreatePersistentSubscription;
}
export default EventsPlugin;
