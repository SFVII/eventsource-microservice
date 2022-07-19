/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
import EventHandler from "./handler";
import EventConsumer from "./consumer";
import EventsPlugin from "./client";
import { IEvenStoreConfig, IEventHandlerGroup, IQueue, IQueueCustom, ITriggerList } from "./core/global";
import { HandleResponse } from "./core/CommonHandler";
export declare type IClient = {
    new <DataModel, Contributor>(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]): EventsPlugin<DataModel, Contributor>;
};
export declare type IConsumer = {
    new <Contributor>(EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue: IQueue | IQueueCustom, publish?: boolean, group?: IEventHandlerGroup): EventConsumer<Contributor>;
};
export declare type IHandler = {
    new (EvenStoreConfig: IEvenStoreConfig, streamList?: string[], triggerOnComplete?: ITriggerList[], group?: IEventHandlerGroup): EventHandler;
};
declare const Instance: <T>(type: 'handler' | 'consumer' | 'client') => IClient | IConsumer | IHandler;
export { EventHandler, EventConsumer, EventsPlugin };
export { EventsPlugin as Client, EventHandler as Handler, EventConsumer as Consumer, HandleResponse };
export default Instance;
