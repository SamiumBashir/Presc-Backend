const API_BASE = 'http://localhost:5000/api';

const runE2EVerification = async () => {
  console.log('\n🚀 Running End-to-End Live API System Verification...\n');

  try {
    // 1. DOCTOR LOGIN
    console.log('1️⃣ Testing Doctor Login...');
    const loginRes = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'doctor@prescription.com', password: 'Doctor123!' }),
    });
    const loginData = await loginRes.json();
    if (!loginData.success || !loginData.data?.token) {
      throw new Error(`Doctor login failed: ${loginData.message}`);
    }
    const token = loginData.data.token;
    const doctor = loginData.data.doctor;
    console.log(`  ✅ Doctor logged in successfully: ${doctor.name} (BMDC: ${doctor.bmdcNumber})`);

    const authHeaders = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };

    // 2. MEDICINE AUTOCOMPLETE & UNANI / AYURVEDIC API VERIFICATION
    console.log('\n2️⃣ Testing Medicine Autocomplete Search API (Allopathic, Unani & Ayurvedic)...');
    
    // Test 2a: Allopathic search
    const medSearchRes = await fetch(`${API_BASE}/medicines/search?q=napa&limit=5`);
    const medSearchData = await medSearchRes.json();
    if (!medSearchData.success || medSearchData.data.length === 0) {
      throw new Error('Allopathic medicine search returned no results.');
    }
    console.log(`  ✅ Found ${medSearchData.data.length} Allopathic medicines matching "napa":`);
    medSearchData.data.forEach((m: any) => console.log(`     • [${m.medicineType || 'Allopathic'}] ${m.dosageForm} ${m.brandName} (${m.strength}) - ${m.genericName}`));

    // Test 2b: Unani search (Cinkara, Safi, Sualin)
    const unaniRes = await fetch(`${API_BASE}/medicines/search?q=cinkara&medicineType=Unani`);
    const unaniData = await unaniRes.json();
    if (!unaniData.success || unaniData.data.length === 0) {
      throw new Error('Unani search for "cinkara" failed.');
    }
    console.log(`  ✅ Verified Unani API search for "cinkara":`);
    unaniData.data.forEach((m: any) => console.log(`     • [${m.medicineType}] ${m.dosageForm} ${m.brandName} (${m.strength}) - ${m.genericName} [${m.manufacturer}]`));

    // Test 2c: Ayurvedic search (Chyawanprash, Triphala, Ashwagandharishta)
    const ayurRes = await fetch(`${API_BASE}/medicines/search?q=triphala&medicineType=Ayurvedic`);
    const ayurData = await ayurRes.json();
    if (!ayurData.success || ayurData.data.length === 0) {
      throw new Error('Ayurvedic search for "triphala" failed.');
    }
    console.log(`  ✅ Verified Ayurvedic API search for "triphala":`);
    ayurData.data.forEach((m: any) => console.log(`     • [${m.medicineType}] ${m.dosageForm} ${m.brandName} (${m.strength}) - ${m.genericName} [${m.manufacturer}]`));

    // Test 2d: Medicine Systems & Types endpoint
    const typesRes = await fetch(`${API_BASE}/medicines/types`);
    const typesData = await typesRes.json();
    if (!typesData.success || typesData.data.length === 0) {
      throw new Error('Medicine types aggregation failed.');
    }
    console.log(`  ✅ Medicine systems stats loaded:`);
    typesData.data.forEach((t: any) => console.log(`     • ${t.nameEn} (${t.nameBn}): ${t.count} medicines registered`));

    // 3. PATIENT SEARCH & REGISTRATION
    console.log('\n3️⃣ Testing Patient Search & Creation...');
    const patientSearchRes = await fetch(`${API_BASE}/patients?search=Karim`, { headers: authHeaders });
    const patientSearchData = await patientSearchRes.json();
    console.log(`  ✅ Found ${patientSearchData.data.patients.length} patient records for "Karim"`);

    const newPatientRes = await fetch(`${API_BASE}/patients`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: 'Mrs. Salma Begum',
        phone: '01888776655',
        age: 48,
        gender: 'Female',
        bloodGroup: 'O+',
        allergies: ['Ciprofloxacin'],
        medicalHistory: ['Asthma', 'GERD'],
      }),
    });
    const newPatientData = await newPatientRes.json();
    if (!newPatientData.success) throw new Error('Patient creation failed');
    const createdPatient = newPatientData.data;
    console.log(`  ✅ Created new patient: ${createdPatient.name} (${createdPatient.patientId})`);

    // 4. WRITE & FINALIZE PRESCRIPTION
    console.log('\n4️⃣ Testing Complete Prescription Workflow (Vitals, Medicines, Advice, Finalization)...');
    const rxPayload = {
      patientId: createdPatient._id,
      vitals: {
        bpSystolic: 135,
        bpDiastolic: 85,
        pulse: 76,
        temperature: 99.1,
        weight: 64,
        height: 158,
        bmi: 25.6,
      },
      chiefComplaints: [
        { complaint: 'Fever with body ache', duration: '3 days' },
        { complaint: 'Epigastric burning & nausea', duration: '5 days' },
      ],
      history: 'Non-diabetic, known asthmatic',
      examination: 'Chest: occasional wheeze, Heart: Normal S1+S2',
      diagnosis: [
        { name: 'Viral Upper Respiratory Tract Infection (URTI)', icdCode: 'J06.9' },
        { name: 'Gastro-esophageal Reflux Disease (GERD)', icdCode: 'K21.9' },
      ],
      medicines: [
        {
          brandName: 'Napa Extra',
          genericName: 'Paracetamol + Caffeine',
          dosageForm: 'Tablet',
          strength: '500 mg + 65 mg',
          dose: '1 tablet',
          frequency: '1+1+1',
          duration: '5 days',
          instruction: 'After meal (খাবার পর)',
          order: 0,
        },
        {
          brandName: 'Maxpro 20',
          genericName: 'Esomeprazole',
          dosageForm: 'Tablet',
          strength: '20 mg',
          dose: '1 tablet',
          frequency: '1+0+1',
          duration: '14 days',
          instruction: 'Before meal (খাবার ৩০ মিনিট আগে)',
          order: 1,
        },
      ],
      investigations: ['CBC with ESR', 'Serum Creatinine', 'USG of Whole Abdomen'],
      advice: [
        'প্রতিদিন পর্যাপ্ত কুসুম গরম পানি পান করুন।',
        'অতিরিক্ত তেল ও মসলাযুক্ত খাবার পরিহার করুন।',
      ],
      followUp: { duration: '7 days', notes: 'With CBC report' },
      status: 'FINALIZED',
    };

    const rxRes = await fetch(`${API_BASE}/prescriptions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify(rxPayload),
    });
    const rxData = await rxRes.json();
    if (!rxData.success || !rxData.data?.prescriptionId) {
      throw new Error(`Prescription creation failed: ${rxData.message}`);
    }
    const prescription = rxData.data;
    console.log(`  ✅ Prescription Finalized Successfully: ${prescription.prescriptionId}`);
    console.log(`     • Status: ${prescription.status}`);
    console.log(`     • Share Token: ${prescription.shareToken}`);

    // 5. TEST IMMUTABILITY OF FINALIZED RECORD
    console.log('\n5️⃣ Testing Immutability of Finalized Prescription...');
    const modifyRes = await fetch(`${API_BASE}/prescriptions/${prescription._id}`, {
      method: 'PUT',
      headers: authHeaders,
      body: JSON.stringify({ ...rxPayload, history: 'Illegal direct overwrite' }),
    });
    const modifyData = await modifyRes.json();
    if (modifyData.success === false) {
      console.log(`  ✅ Immutability Verified: Server blocked direct edit (${modifyData.message})`);
    } else {
      throw new Error('Finalized prescription was illegally overwritten!');
    }

    // 6. TEST DUPLICATE / CLONING PRESCRIPTION
    console.log('\n6️⃣ Testing Prescription Duplication (Clone Rx for Returning Patient)...');
    const cloneRes = await fetch(`${API_BASE}/prescriptions/${prescription._id}/duplicate`, {
      method: 'POST',
      headers: authHeaders,
    });
    const cloneData = await cloneRes.json();
    if (!cloneData.success || cloneData.data.status !== 'DRAFT') {
      throw new Error('Duplication failed');
    }
    console.log(`  ✅ Cloned prescription created: ${cloneData.data.prescriptionId} (Status: ${cloneData.data.status})`);

    // 7. TEST PATIENT MEDICAL TIMELINE
    console.log('\n7️⃣ Testing Patient Medical History Timeline...');
    const timelineRes = await fetch(`${API_BASE}/patients/${createdPatient._id}/history`, { headers: authHeaders });
    const timelineData = await timelineRes.json();
    console.log(`  ✅ Timeline loaded: ${timelineData.data.timeline.length} visits recorded for ${createdPatient.name}`);

    // 8. TEST PUBLIC VERIFICATION LINK
    console.log('\n8️⃣ Testing Public QR Share Endpoint...');
    const publicRes = await fetch(`${API_BASE}/public/prescriptions/share/${prescription.shareToken}`);
    const publicData = await publicRes.json();
    if (!publicData.success || publicData.data.prescriptionId !== prescription.prescriptionId) {
      throw new Error('Public share verification failed');
    }
    console.log(`  ✅ Public verification verified for Rx: ${publicData.data.prescriptionId}`);

    console.log('\n=============================================================');
    console.log('🎉 ALL END-TO-END LIVE INTEGRATION TESTS PASSED (100% SUCCESS)');
    console.log('=============================================================\n');
  } catch (err) {
    console.error('❌ E2E Verification failed:', err);
    process.exit(1);
  }
};

runE2EVerification();
