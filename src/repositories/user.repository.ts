import { User, IUser } from '../models/User';
import { Doctor, IDoctor } from '../models/Doctor';

export class UserRepository {
  async findUserById(id: string): Promise<IUser | null> {
    return User.findById(id);
  }

  async findUserByEmail(email: string): Promise<IUser | null> {
    return User.findOne({ email: email.toLowerCase() });
  }

  async findDoctorByUserId(userId: string): Promise<IDoctor | null> {
    return Doctor.findOne({ userId });
  }

  async findDoctorById(id: string): Promise<IDoctor | null> {
    return Doctor.findById(id).populate('userId', 'name email role status');
  }

  async findAllDoctors() {
    return Doctor.find().populate('userId', 'name email role status createdAt').sort({ createdAt: -1 });
  }
}

export const userRepository = new UserRepository();
