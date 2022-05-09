export interface IEventCollection {
    StreamName: string;
    Revision: bigint;
    Services: boolean;
    Active: boolean;
    IsCreatedPersistent: boolean;
    CreatedDate: Date;
    UpdatedDate: Date;
}
declare const MongoosePlugin: (mongoose: any) => any;
export default MongoosePlugin;
