"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TemplateSchema = exports.ChamberSchema = exports.MedicineSchema = exports.PrescriptionSchema = exports.PrescriptionMedicineSchema = exports.PatientSchema = exports.ResetPasswordSchema = exports.ResendOtpSchema = exports.VerifyOtpSchema = exports.ForgotPasswordSchema = exports.LoginSchema = exports.RegisterDoctorSchema = exports.PasswordPolicySchema = void 0;
const zod_1 = require("zod");
exports.PasswordPolicySchema = zod_1.z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');
exports.RegisterDoctorSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Name must be at least 2 characters'),
    email: zod_1.z.string().email('Invalid email address'),
    phone: zod_1.z.string().min(5, 'Phone must be at least 5 digits').optional().or(zod_1.z.literal('')),
    password: exports.PasswordPolicySchema,
    qualification: zod_1.z.string().optional().default('MBBS'),
    specialization: zod_1.z.string().optional().default('General Physician'),
    bmdcNumber: zod_1.z.string().optional().default(''),
    workplace: zod_1.z.string().optional(),
});
exports.LoginSchema = zod_1.z.object({
    email: zod_1.z.string().email('Invalid email address'),
    password: zod_1.z.string().min(1, 'Password is required'),
    rememberMe: zod_1.z.boolean().optional(),
});
exports.ForgotPasswordSchema = zod_1.z.object({
    email: zod_1.z.string().email('Please enter a valid email address'),
});
exports.VerifyOtpSchema = zod_1.z.object({
    email: zod_1.z.string().email('Please enter a valid email address'),
    otp: zod_1.z.string().regex(/^\d{6}$/, 'OTP must be exactly 6 digits'),
});
exports.ResendOtpSchema = zod_1.z.object({
    email: zod_1.z.string().email('Please enter a valid email address'),
});
exports.ResetPasswordSchema = zod_1.z
    .object({
    resetToken: zod_1.z.string().optional(),
    password: exports.PasswordPolicySchema.optional(),
    newPassword: exports.PasswordPolicySchema.optional(),
    confirmPassword: zod_1.z.string().optional(),
})
    .refine((data) => Boolean(data.password || data.newPassword), {
    message: 'New password is required and must meet security policy requirements',
    path: ['newPassword'],
})
    .refine((data) => {
    const pwd = data.newPassword || data.password;
    if (data.confirmPassword && pwd) {
        return pwd === data.confirmPassword;
    }
    return true;
}, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
});
exports.PatientSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Patient name is required'),
    phone: zod_1.z.string().optional().default(''),
    email: zod_1.z.string().email().optional().or(zod_1.z.literal('')),
    age: zod_1.z.coerce.number().min(0).max(130, 'Age must be between 0 and 130'),
    gender: zod_1.z.enum(['Male', 'Female', 'Other']),
    bloodGroup: zod_1.z
        .enum(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'])
        .optional(),
    address: zod_1.z.string().optional(),
    emergencyContact: zod_1.z.string().optional(),
    allergies: zod_1.z.array(zod_1.z.string()).optional().default([]),
    medicalHistory: zod_1.z.array(zod_1.z.string()).optional().default([]),
    notes: zod_1.z.string().optional(),
});
exports.PrescriptionMedicineSchema = zod_1.z.object({
    medicineId: zod_1.z.string().optional().nullable(),
    brandName: zod_1.z.string().min(1, 'Medicine brand name is required'),
    genericName: zod_1.z.string().optional().nullable(),
    dosageForm: zod_1.z.string().default('Tablet'),
    strength: zod_1.z.string().optional().nullable(),
    dose: zod_1.z.string().default('1 tablet'),
    frequency: zod_1.z.string().default('1+0+1'),
    duration: zod_1.z.string().default('5 days'),
    instruction: zod_1.z.string().default('After meal'),
    customNote: zod_1.z.string().optional().nullable(),
    order: zod_1.z.number().default(0),
});
exports.PrescriptionSchema = zod_1.z.object({
    patientId: zod_1.z.string().min(1, 'Patient ID is required'),
    chamberId: zod_1.z.string().optional().nullable(),
    vitals: zod_1.z
        .object({
        bpSystolic: zod_1.z.coerce.number().optional().nullable(),
        bpDiastolic: zod_1.z.coerce.number().optional().nullable(),
        pulse: zod_1.z.coerce.number().optional().nullable(),
        temperature: zod_1.z.coerce.number().optional().nullable(),
        spo2: zod_1.z.coerce.number().optional().nullable(),
        weight: zod_1.z.coerce.number().optional().nullable(),
        height: zod_1.z.coerce.number().optional().nullable(),
        bmi: zod_1.z.coerce.number().optional().nullable(),
    })
        .optional()
        .nullable(),
    chiefComplaints: zod_1.z
        .array(zod_1.z.object({
        complaint: zod_1.z.string().min(1),
        duration: zod_1.z.string().optional().nullable(),
        note: zod_1.z.string().optional().nullable(),
    }))
        .default([]),
    history: zod_1.z.string().optional().nullable(),
    examination: zod_1.z.string().optional().nullable(),
    diagnosis: zod_1.z
        .array(zod_1.z.object({
        name: zod_1.z.string().min(1),
        icdCode: zod_1.z.string().optional().nullable(),
        type: zod_1.z.enum(['provisional', 'differential', 'confirmed']).default('provisional'),
    }))
        .default([]),
    medicines: zod_1.z.array(exports.PrescriptionMedicineSchema).default([]),
    investigations: zod_1.z.array(zod_1.z.string()).default([]),
    advice: zod_1.z.array(zod_1.z.string()).default([]),
    followUp: zod_1.z
        .object({
        duration: zod_1.z.string().default('7 days'),
        date: zod_1.z.string().optional().nullable(),
        notes: zod_1.z.string().optional().nullable(),
    })
        .optional()
        .nullable(),
    notes: zod_1.z.string().optional().nullable(),
    status: zod_1.z.enum(['DRAFT', 'FINALIZED']).default('DRAFT'),
});
exports.MedicineSchema = zod_1.z.object({
    brandName: zod_1.z.string().min(1, 'Brand name is required'),
    genericName: zod_1.z.string().min(1, 'Generic name is required'),
    strength: zod_1.z.string().min(1, 'Strength is required'),
    dosageForm: zod_1.z.string().optional().default('Tablet'),
    form: zod_1.z.string().optional(),
    manufacturer: zod_1.z.string().optional().default('General'),
    manufacture: zod_1.z.string().optional(),
    category: zod_1.z.string().optional().default('General'),
    medicineType: zod_1.z.enum(['Allopathic', 'Unani', 'Ayurvedic', 'Herbal']).optional().default('Allopathic'),
    type: zod_1.z.enum(['Allopathic', 'Unani', 'Ayurvedic', 'Herbal']).optional(),
    unit: zod_1.z.string().optional(),
    price: zod_1.z.number().optional(),
    status: zod_1.z.enum(['active', 'inactive']).optional().default('active'),
});
exports.ChamberSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Chamber name is required'),
    address: zod_1.z.string().min(3, 'Chamber address is required'),
    phone: zod_1.z.string().optional(),
    appointmentPhone: zod_1.z.string().optional(),
    visitingDays: zod_1.z.array(zod_1.z.string()).default(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']),
    visitingHours: zod_1.z.string().default('5:00 PM - 9:00 PM'),
    roomNo: zod_1.z.string().optional(),
    website: zod_1.z.string().optional(),
    signature: zod_1.z.string().optional(),
    isDefault: zod_1.z.boolean().default(false),
});
exports.TemplateSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, 'Template name is required'),
    category: zod_1.z.string().default('General'),
    description: zod_1.z.string().optional(),
    chiefComplaints: zod_1.z
        .array(zod_1.z.object({
        complaint: zod_1.z.string(),
        duration: zod_1.z.string().optional(),
    }))
        .optional(),
    diagnosis: zod_1.z
        .array(zod_1.z.object({
        name: zod_1.z.string(),
        icdCode: zod_1.z.string().optional(),
    }))
        .optional(),
    medicines: zod_1.z.array(exports.PrescriptionMedicineSchema).default([]),
    investigations: zod_1.z.array(zod_1.z.string()).default([]),
    advice: zod_1.z.array(zod_1.z.string()).default([]),
    followUpDuration: zod_1.z.string().default('7 days'),
});
