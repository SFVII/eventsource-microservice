# eventsource-microservice


![use case schema](https://raw.githubusercontent.com/SFVII/eventsource-microservice/master/eventsource-microservice.drawio.svg?sanitize=true)

##Prerequisite

##Client
```
...
import mongoose from "mongoose";
import Instance from "eventsource-microservice";

const Service = Instance('client', mongoose);


```

##Consumer
```
...
import mongoose from "mongoose";
import Instance from "eventsource-microservice";

const Consumer = Instance('consumer', mongoose);
const QueueTTL = 2000; // set it to 0 for One By One thread;
const orderValidation = new Instance({
    connexion: {
        endpoint: "eventstore:2113"
    },
    security: {
        insecure: true
    },
    credentials: {
        username: "admin",
        password: "changeit"
    }
}, 'orderValidation', QueueTTL); 

orderValidation.on('ready', async () => {
    for await (const ResolvedEvent of consumer.subscription) {
        const {event} = ResolvedEvent;
        console.log('New order-validation event', event)
        orderValidation.AddToQueue(event.type, ResolvedEvent);
        await consumer.subscription.ack(ResolvedEvent);
    }
})

// trigger every <QueueTTL> a list of ordervalidation type = 'create';
orderValidation.on('create', async (itemToAdd) => {
    const toAdd = [];
    for(const ResolvedEvent of itemToAdd) {
        const {event} = ResolvedEvent;
        toAdd.push(event.data);
    }
    /// DO YOUR STUFF HERE
    const stock = checkStock(toAdd);
    for (let i; i < stock.length; i++) {
       const current = stock[i];
       if (current.stock < 1 && itemToAdd[i]){
          orderValidation.handler(itemToAdd[i], {
             status : 'error',
             message : 'Insufisiant quantity'
          }, true);
          stock[i] = null;
          itemToAdd[i] = null;
       }
    }
    for (const item of itemToAdd) {
        if (item) orderValidation.handler(item, {...item.event.data, ...{stockReserved : true}}, false)
    }
})

```

##Handler

```
...
import mongoose from "mongoose";
import Instance from "eventsource-microservice";

const instance = Instance('handler', mongoose);


```
