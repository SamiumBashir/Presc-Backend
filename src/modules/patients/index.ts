export * as patientController from '../../controllers/patient.controller';
export { default as patientRoutes } from '../../routes/patient.routes';
export { Patient, IPatient } from '../../models/Patient';
export { patientRepository } from '../../repositories/patient.repository';
export { PatientSchema } from '../../validators/schemas';
