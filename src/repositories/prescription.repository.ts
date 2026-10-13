import { Prescription, IPrescription } from '../models/Prescription';
import { FilterQuery } from 'mongoose';

export class PrescriptionRepository {
  async findById(id: string): Promise<IPrescription | null> {
    return Prescription.findById(id).populate('patientId').populate('chamberId');
  }

  async findOne(filter: FilterQuery<IPrescription>): Promise<IPrescription | null> {
    return Prescription.findOne(filter).populate('patientId').populate('chamberId');
  }

  async find(filter: FilterQuery<IPrescription>, options?: { skip?: number; limit?: number; sort?: any }) {
    let query = Prescription.find(filter).populate('patientId').populate('chamberId');
    if (options?.sort) query = query.sort(options.sort);
    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);
    return query.exec();
  }

  async count(filter: FilterQuery<IPrescription>): Promise<number> {
    return Prescription.countDocuments(filter);
  }

  async create(data: Partial<IPrescription>): Promise<IPrescription> {
    return Prescription.create(data);
  }

  async update(id: string, data: Partial<IPrescription>): Promise<IPrescription | null> {
    return Prescription.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }
}

export const prescriptionRepository = new PrescriptionRepository();
