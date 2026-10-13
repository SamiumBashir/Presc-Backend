"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userRepository = exports.UserRepository = void 0;
const User_1 = require("../models/User");
const Doctor_1 = require("../models/Doctor");
class UserRepository {
    async findUserById(id) {
        return User_1.User.findById(id);
    }
    async findUserByEmail(email) {
        return User_1.User.findOne({ email: email.toLowerCase() });
    }
    async findDoctorByUserId(userId) {
        return Doctor_1.Doctor.findOne({ userId });
    }
    async findDoctorById(id) {
        return Doctor_1.Doctor.findById(id).populate('userId', 'name email role status');
    }
    async findAllDoctors() {
        return Doctor_1.Doctor.find().populate('userId', 'name email role status createdAt').sort({ createdAt: -1 });
    }
}
exports.UserRepository = UserRepository;
exports.userRepository = new UserRepository();
