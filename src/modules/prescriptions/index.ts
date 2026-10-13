export * as prescriptionController from '../../controllers/prescription.controller';
export { default as prescriptionRoutes } from '../../routes/prescription.routes';
export { Prescription, IPrescription } from '../../models/Prescription';
export { prescriptionRepository } from '../../repositories/prescription.repository';
export { PrescriptionSchema } from '../../validators/schemas';
