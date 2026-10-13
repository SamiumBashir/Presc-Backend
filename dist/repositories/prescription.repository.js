"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.prescriptionRepository = exports.PrescriptionRepository = void 0;
const Prescription_1 = require("../models/Prescription");
class PrescriptionRepository {
    async findById(id) {
        return Prescription_1.Prescription.findById(id).populate('patientId').populate('chamberId');
    }
    async findOne(filter) {
        return Prescription_1.Prescription.findOne(filter).populate('patientId').populate('chamberId');
    }
    async find(filter, options) {
        let query = Prescription_1.Prescription.find(filter).populate('patientId').populate('chamberId');
        if (options?.sort)
            query = query.sort(options.sort);
        if (options?.skip)
            query = query.skip(options.skip);
        if (options?.limit)
            query = query.limit(options.limit);
        return query.exec();
    }
    async count(filter) {
        return Prescription_1.Prescription.countDocuments(filter);
    }
    async create(data) {
        return Prescription_1.Prescription.create(data);
    }
    async update(id, data) {
        return Prescription_1.Prescription.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    }
}
exports.PrescriptionRepository = PrescriptionRepository;
exports.prescriptionRepository = new PrescriptionRepository();
