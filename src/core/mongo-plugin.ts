import mongooseLong from "mongoose-long";

export interface IEventCollection {
    StreamName: string;
    Revision: bigint,
    Services: boolean,
    Active: boolean,
    IsCreatedPersistent: boolean,
    CreatedDate: Date,
    UpdatedDate: Date
}

const MongoosePlugin = (mongoose: any) => {
    mongooseLong(mongoose);
    /***********************************************************
     **  @project
     **  @file
     **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
     **  @Date 09/02/2022
     **  @Description
     ***********************************************************/


    const EventCollection = mongoose.model('events-checkpoint', new mongoose.Schema({
        StreamName: String,
        Revision: mongoose.Schema.Types.Long,
        Service: Boolean,
        Active: Boolean,
        IsCreatedPersistent : Boolean,
        CreatedDate: mongoose.Schema.Types.Date,
        UpdatedDate: mongoose.Schema.Types.Date
    }));

    EventCollection.collection.createIndex({
        StreamName: 1
    });
    return EventCollection;
}

export default MongoosePlugin;
