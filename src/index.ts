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
import {IEvenStoreConfig, IEventHandlerGroup, IQueue, IQueueCustom, ITriggerList} from "./core/global";

export type IClient = { new<DataModel>(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]): EventsPlugin<DataModel> }

export type IConsumer = { new(EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue: IQueue | IQueueCustom, publish?: boolean, group?: IEventHandlerGroup): EventConsumer }

export type IHandler = { new(EvenStoreConfig: IEvenStoreConfig, streamList?: string[], triggerOnComplete?: ITriggerList[], group?: IEventHandlerGroup): EventHandler }

type IMd5DataHash = string; // simple Md5 hash (ex 8e614206a5b7f665b6948d4f5c7c9a29) from input data

type ICausationId = string; // name of last mservice action consumer-x client-x etc...

type ICausationRoute = ICausationId[] // route to take ex -> mapping -> consumer (['mapping', 'consumer']) will execute mapping and publish on consumer string

type ITypeOrigin = 'create' | 'delete' | 'update' | 'recover' | string; // origin type of input action.

type IContributorBinding<T> = keyof T

type IContributor<T> = { // data model to track user of event action
    [key in IContributorBinding<T>]: T[key];
}

export type IMetadata<Contributor> = {
    $correlationId: IMd5DataHash,
    $causationId: ICausationId,
    state: 'processing' | 'completed' | 'error' | 'delivered',
    causationRoute: ICausationRoute,
    typeOrigin: ITypeOrigin,
    contributor: IContributor<Contributor>
}

const Instance = <T>(type: 'handler' | 'consumer' | 'client'): IClient | IConsumer | IHandler => {
    switch (type) {
        case 'handler':
            return EventHandler;
        case 'consumer':
            return EventConsumer;
        case 'client':
            return EventsPlugin;
    }
}
export {EventHandler, EventConsumer, EventsPlugin}

export {EventsPlugin as Client, EventHandler as Handler, EventConsumer as Consumer}

export default Instance;
