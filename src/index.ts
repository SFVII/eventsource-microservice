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
import {IEvenStoreConfig, IEventHandlerGroup, IQueue, IQueueCustom, ITriggerList, JSONType} from "./core/global";


export type IClient = { new<DataModel extends JSONType>(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]): EventsPlugin<DataModel>}
export type IConsumer = { new(EvenStoreConfig: IEvenStoreConfig, StreamName: string, queue: IQueue | IQueueCustom, group?: IEventHandlerGroup): EventConsumer }
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

export default Instance;
