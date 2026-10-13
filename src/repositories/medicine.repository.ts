import { Medicine, IMedicine } from '../models/Medicine';
import { FilterQuery } from 'mongoose';

export class MedicineRepository {
  async findById(id: string): Promise<IMedicine | null> {
    return Medicine.findById(id);
  }

  async find(filter: FilterQuery<IMedicine>, options?: { skip?: number; limit?: number; sort?: any }) {
    let query = Medicine.find(filter);
    if (options?.sort) query = query.sort(options.sort);
    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);
    return query.exec();
  }

  async count(filter: FilterQuery<IMedicine>): Promise<number> {
    return Medicine.countDocuments(filter);
  }

  async create(data: Partial<IMedicine>): Promise<IMedicine> {
    return Medicine.create(data);
  }

  async update(id: string, data: Partial<IMedicine>): Promise<IMedicine | null> {
    return Medicine.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }

  async delete(id: string): Promise<IMedicine | null> {
    return Medicine.findByIdAndDelete(id);
  }
}

export const medicineRepository = new MedicineRepository();
