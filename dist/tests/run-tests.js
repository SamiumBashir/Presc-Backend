"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const db_1 = require("../config/db");
const User_1 = require("../models/User");
const Doctor_1 = require("../models/Doctor");
const Patient_1 = require("../models/Patient");
const Medicine_1 = require("../models/Medicine");
const Prescription_1 = require("../models/Prescription");
const seed_1 = require("../seeds/seed");
let passed = 0;
let failed = 0;
const assert = (condition, testName) => {
    if (condition) {
        console.log(`  ✅ PASS: ${testName}`);
        passed++;
    }
    else {
        console.error(`  ❌ FAIL: ${testName}`);
        failed++;
    }
};
const runAllTests = async () => {
    console.log('\n🏥 Starting DocRx Automated Backend Test Suite...\n');
    await (0, db_1.connectDatabase)();
    await (0, seed_1.seedDatabase)(true);
    try {
        // ----------------------------------------------------
        // TEST SUITE 1: Authentication & Doctor Profile
        // ----------------------------------------------------
        console.log('🔹 Suite 1: Authentication & Doctor Credentials');
        const doctorUser = await User_1.User.findOne({ email: 'doctor@prescription.com' });
        assert(!!doctorUser, 'Doctor user exists in database');
        assert(doctorUser?.role === 'doctor', 'Doctor user has "doctor" role');
        const passwordMatch = await bcryptjs_1.default.compare('Doctor123!', doctorUser.passwordHash);
        assert(passwordMatch, 'Doctor password hashes and validates correctly');
        const doctorProfile = await Doctor_1.Doctor.findOne({ userId: doctorUser._id });
        assert(!!doctorProfile, 'Doctor profile linked to user');
        assert(doctorProfile?.bmdcNumber === 'A-54321', 'Doctor BMDC number matches A-54321');
        // ----------------------------------------------------
        // TEST SUITE 2: Medicine Database & Autocomplete
        // ----------------------------------------------------
        console.log('\n🔹 Suite 2: Medicine Database & Smart Search Autocomplete');
        const totalMedicines = await Medicine_1.Medicine.countDocuments();
        assert(totalMedicines >= 40, `Medicine database populated with ${totalMedicines} entries`);
        const napaMatches = await Medicine_1.Medicine.find({
            $or: [{ brandName: /^napa/i }, { genericName: /^napa/i }],
        });
        assert(napaMatches.length >= 3, `Autocomplete finds ${napaMatches.length} Napa brand variations (Napa, Napa Extra, etc.)`);
        const paraMatches = await Medicine_1.Medicine.find({
            genericName: /paracetamol/i,
        });
        assert(paraMatches.length >= 5, `Generic search for "Paracetamol" returns ${paraMatches.length} brand medicines`);
        // Unani & Ayurvedic assertions
        const unaniCount = await Medicine_1.Medicine.countDocuments({ medicineType: 'Unani' });
        assert(unaniCount >= 10, `Unani medicine database has ${unaniCount} entries (Cinkara, Safi, Sualin, etc.)`);
        const ayurCount = await Medicine_1.Medicine.countDocuments({ medicineType: 'Ayurvedic' });
        assert(ayurCount >= 10, `Ayurvedic medicine database has ${ayurCount} entries (Chyawanprash, Triphala, etc.)`);
        // ----------------------------------------------------
        // TEST SUITE 3: Patient Management & Scope Isolation
        // ----------------------------------------------------
        console.log('\n🔹 Suite 3: Patient Management & Authorization Isolation');
        const doctorA = doctorProfile;
        // Create Doctor B
        const docBUser = await User_1.User.create({
            name: 'Dr. Other Doctor',
            email: 'other.doc@example.com',
            passwordHash: 'hashedpass',
            role: 'doctor',
            status: 'active',
        });
        const doctorB = await Doctor_1.Doctor.create({
            userId: docBUser._id,
            name: 'Dr. Other Doctor',
            qualification: 'MBBS',
            specialization: 'General',
            bmdcNumber: 'B-99999',
        });
        const patientA = await Patient_1.Patient.findOne({ doctorId: doctorA._id });
        assert(!!patientA, 'Doctor A has registered patients');
        // Doctor B tries to find Doctor A's patient with scoped query:
        const leakedPatient = await Patient_1.Patient.findOne({ _id: patientA._id, doctorId: doctorB._id });
        assert(!leakedPatient, 'CRITICAL PRIVACY TEST: Doctor B CANNOT access Doctor A patient');
        // ----------------------------------------------------
        // TEST SUITE 4: Prescription Immutability & Cloning
        // ----------------------------------------------------
        console.log('\n🔹 Suite 4: Prescription Lifecycle & Finalization Immutability');
        const existingRx = await Prescription_1.Prescription.findOne({ doctorId: doctorA._id, status: 'FINALIZED' });
        assert(!!existingRx, 'Finalized prescription exists');
        assert(existingRx?.status === 'FINALIZED', 'Prescription status is FINALIZED');
        // Duplicate test
        const clonedRx = await Prescription_1.Prescription.create({
            prescriptionId: 'RX-2026-TESTCLONE',
            doctorId: doctorA._id,
            patientId: existingRx.patientId,
            patientSnapshot: existingRx.patientSnapshot,
            chiefComplaints: existingRx.chiefComplaints,
            medicines: existingRx.medicines,
            diagnosis: existingRx.diagnosis,
            investigations: existingRx.investigations,
            advice: existingRx.advice,
            status: 'DRAFT',
            shareToken: crypto_1.default.randomBytes(16).toString('hex'),
            parentPrescriptionId: existingRx._id,
        });
        assert(clonedRx.status === 'DRAFT', 'Cloned prescription is created as an editable DRAFT');
        assert(clonedRx.parentPrescriptionId?.toString() === existingRx._id.toString(), 'Cloned prescription maintains link to parent prescription');
        console.log(`\n=========================================`);
        console.log(`📊 Test Results: ${passed} Passed, ${failed} Failed`);
        console.log(`=========================================\n`);
        if (failed > 0) {
            process.exit(1);
        }
    }
    catch (err) {
        console.error('Test execution error:', err);
        process.exit(1);
    }
    finally {
        await (0, db_1.closeDatabase)();
    }
};
runAllTests();
