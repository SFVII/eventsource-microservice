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
export declare type IClient = {
    new <DataModel>(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]): EventsPlugin<DataModel>;
};
export declare type IConsumer = {
    new (EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue: IQueue | IQueueCustom, publish?: boolean, group?: IEventHandlerGroup): EventConsumer;
};
export declare type IHandler = {
    new (EvenStoreConfig: IEvenStoreConfig, streamList?: string[], triggerOnComplete?: ITriggerList[], group?: IEventHandlerGroup): EventHandler;
};
declare type IMd5DataHash = string;
declare type ICausationId = string;
declare type ICausationRoute = ICausationId[];
declare type ITypeOrigin = 'create' | 'delete' | 'update' | 'recover' | string;
declare type IContributorBinding<T> = keyof T;
declare type IContributor<T> = {
    [key in IContributorBinding<T>]: T[key];
};
export declare type IMetadata<Contributor> = {
    $correlationId: IMd5DataHash;
    $causationId: ICausationId;
    state: 'processing' | 'completed' | 'error' | 'delivered';
    causationRoute: ICausationRoute;
    typeOrigin: ITypeOrigin;
    contributor: IContributor<Contributor>;
};
declare const Instance: <T>(type: 'handler' | 'consumer' | 'client') => IClient | IConsumer | IHandler;
export { EventHandler, EventConsumer, EventsPlugin };
export { EventsPlugin as Client, EventHandler as Handler, EventConsumer as Consumer };
export default Instance;
