import { Patient, IPatient } from '../models/Patient';
import { FilterQuery } from 'mongoose';

export class PatientRepository {
  async findById(id: string): Promise<IPatient | null> {
    return Patient.findById(id);
  }

  async findOne(filter: FilterQuery<IPatient>): Promise<IPatient | null> {
    return Patient.findOne(filter);
  }

  async find(filter: FilterQuery<IPatient>, options?: { skip?: number; limit?: number; sort?: any }) {
    let query = Patient.find(filter);
    if (options?.sort) query = query.sort(options.sort);
    if (options?.skip) query = query.skip(options.skip);
    if (options?.limit) query = query.limit(options.limit);
    return query.exec();
  }

  async count(filter: FilterQuery<IPatient>): Promise<number> {
    return Patient.countDocuments(filter);
  }

  async create(data: Partial<IPatient>): Promise<IPatient> {
    return Patient.create(data);
  }

  async update(id: string, data: Partial<IPatient>): Promise<IPatient | null> {
    return Patient.findByIdAndUpdate(id, data, { new: true, runValidators: true });
  }

  async delete(id: string): Promise<IPatient | null> {
    return Patient.findByIdAndDelete(id);
  }
}

export const patientRepository = new PatientRepository();
