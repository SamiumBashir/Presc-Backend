"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.patientRepository = exports.PatientRepository = void 0;
const Patient_1 = require("../models/Patient");
class PatientRepository {
    async findById(id) {
        return Patient_1.Patient.findById(id);
    }
    async findOne(filter) {
        return Patient_1.Patient.findOne(filter);
    }
    async find(filter, options) {
        let query = Patient_1.Patient.find(filter);
        if (options?.sort)
            query = query.sort(options.sort);
        if (options?.skip)
            query = query.skip(options.skip);
        if (options?.limit)
            query = query.limit(options.limit);
        return query.exec();
    }
    async count(filter) {
        return Patient_1.Patient.countDocuments(filter);
    }
    async create(data) {
        return Patient_1.Patient.create(data);
    }
    async update(id, data) {
        return Patient_1.Patient.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    }
    async delete(id) {
        return Patient_1.Patient.findByIdAndDelete(id);
    }
}
exports.PatientRepository = PatientRepository;
exports.patientRepository = new PatientRepository();
