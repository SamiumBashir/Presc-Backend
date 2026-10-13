"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.medicineRepository = exports.MedicineRepository = void 0;
const Medicine_1 = require("../models/Medicine");
class MedicineRepository {
    async findById(id) {
        return Medicine_1.Medicine.findById(id);
    }
    async find(filter, options) {
        let query = Medicine_1.Medicine.find(filter);
        if (options?.sort)
            query = query.sort(options.sort);
        if (options?.skip)
            query = query.skip(options.skip);
        if (options?.limit)
            query = query.limit(options.limit);
        return query.exec();
    }
    async count(filter) {
        return Medicine_1.Medicine.countDocuments(filter);
    }
    async create(data) {
        return Medicine_1.Medicine.create(data);
    }
    async update(id, data) {
        return Medicine_1.Medicine.findByIdAndUpdate(id, data, { new: true, runValidators: true });
    }
    async delete(id) {
        return Medicine_1.Medicine.findByIdAndDelete(id);
    }
}
exports.MedicineRepository = MedicineRepository;
exports.medicineRepository = new MedicineRepository();
