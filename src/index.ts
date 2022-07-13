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

export type IClient = { new<DataModel, Contributor>(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]): EventsPlugin<DataModel,Contributor> }

export type IConsumer = { new<Contributor>(EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue: IQueue | IQueueCustom, publish?: boolean, group?: IEventHandlerGroup): EventConsumer<Contributor> }

export type IHandler = { new(EvenStoreConfig: IEvenStoreConfig, streamList?: string[], triggerOnComplete?: ITriggerList[], group?: IEventHandlerGroup): EventHandler }


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
