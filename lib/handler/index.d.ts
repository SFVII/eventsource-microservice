/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import { IEvenStoreConfig, IEventHandlerGroup, ITriggerList, Method } from "../core/global";
declare class EventHandler {
    protected methods: Method;
    protected streamName: string[];
    protected group: string;
    protected streamList: string[];
    protected credentials: IEvenStoreConfig["credentials"];
    protected triggerOnComplete: ITriggerList[];
    private client;
    private StartRevision;
    private stream;
    constructor(EvenStoreConfig: IEvenStoreConfig, streamList: string[], triggerOnComplete?: ITriggerList[], group?: IEventHandlerGroup);
    private init;
    private dispatcher;
    private handler;
    private template;
    private SubscribeToPersistent;
    private CreatePersistentSubscription;
}
export default EventHandler;
