import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User } from '../models/User';
import { Doctor } from '../models/Doctor';
import { Chamber } from '../models/Chamber';
import { Patient } from '../models/Patient';
import { Medicine } from '../models/Medicine';
import { Template } from '../models/Template';
import { Prescription } from '../models/Prescription';
import { AuditLog } from '../models/AuditLog';
import { connectDatabase, closeDatabase } from '../config/db';

export const POPULAR_BANGLADESH_MEDICINES = [
  // Paracetamol & Analgesics
  { brandName: 'Napa', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Napa Extra', genericName: 'Paracetamol + Caffeine', strength: '500 mg + 65 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Napa Extend', genericName: 'Paracetamol', strength: '665 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Napa Rapid', genericName: 'Paracetamol (Actizorb)', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Napa Syrup', genericName: 'Paracetamol', strength: '120 mg/5 ml', dosageForm: 'Syrup', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Ace', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Ace Plus', genericName: 'Paracetamol + Caffeine', strength: '500 mg + 65 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Ace Power', genericName: 'Paracetamol', strength: '1000 mg', dosageForm: 'Suppository', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Fast', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Acme Laboratories Ltd.', category: 'Analgesic & Antipyretic' },
  { brandName: 'Xpa', genericName: 'Paracetamol', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Aristopharma Ltd.', category: 'Analgesic & Antipyretic' },

  // Antiulcerants (PPIs)
  { brandName: 'Seclo 20', genericName: 'Omeprazole', strength: '20 mg', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Seclo 40', genericName: 'Omeprazole', strength: '40 mg', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Pantonix 20', genericName: 'Pantoprazole', strength: '20 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Pantonix 40', genericName: 'Pantoprazole', strength: '40 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Maxpro 20', genericName: 'Esomeprazole', strength: '20 mg', dosageForm: 'Tablet', manufacturer: 'Renata Limited', category: 'Antiulcerant (PPI)' },
  { brandName: 'Maxpro 40', genericName: 'Esomeprazole', strength: '40 mg', dosageForm: 'Tablet', manufacturer: 'Renata Limited', category: 'Antiulcerant (PPI)' },
  { brandName: 'Sergel 20', genericName: 'Esomeprazole', strength: '20 mg', dosageForm: 'Capsule', manufacturer: 'Healthcare Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Sergel 40', genericName: 'Esomeprazole', strength: '40 mg', dosageForm: 'Capsule', manufacturer: 'Healthcare Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Losectil 20', genericName: 'Omeprazole', strength: '20 mg', dosageForm: 'Capsule', manufacturer: 'Eskayef Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Finix 20', genericName: 'Rabeprazole', strength: '20 mg', dosageForm: 'Tablet', manufacturer: 'Opsonin Pharma Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Rabeloc 20', genericName: 'Rabeprazole', strength: '20 mg', dosageForm: 'Tablet', manufacturer: 'Aristopharma Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Dexil 30', genericName: 'Dexlansoprazole', strength: '30 mg', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },
  { brandName: 'Dexil 60', genericName: 'Dexlansoprazole', strength: '60 mg', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antiulcerant (PPI)' },

  // Antihistamines & Respiratory
  { brandName: 'Fexo 120', genericName: 'Fexofenadine HCl', strength: '120 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antihistamine' },
  { brandName: 'Fexo 180', genericName: 'Fexofenadine HCl', strength: '180 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antihistamine' },
  { brandName: 'Monas 10', genericName: 'Montelukast Sodium', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Leukotriene Receptor Antagonist' },
  { brandName: 'Monas 5', genericName: 'Montelukast Sodium', strength: '5 mg', dosageForm: 'Chewable Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Leukotriene Receptor Antagonist' },
  { brandName: 'Monas 4', genericName: 'Montelukast Sodium', strength: '4 mg', dosageForm: 'Chewable Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Leukotriene Receptor Antagonist' },
  { brandName: 'Alarid 10', genericName: 'Cetirizine HCl', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Renata Limited', category: 'Antihistamine' },
  { brandName: 'Bilaten 20', genericName: 'Bilastine', strength: '20 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antihistamine' },
  { brandName: 'Tofen 1', genericName: 'Ketotifen', strength: '1 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Antihistamine & Mast Cell Stabilizer' },
  { brandName: 'Tuspel', genericName: 'Dextromethorphan + Pseudoephedrine + Triprolidine', strength: '100 ml', dosageForm: 'Syrup', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Cough Suppressant' },
  { brandName: 'Mirakof', genericName: 'Butamirate Citrate', strength: '50 mg', dosageForm: 'Tablet', manufacturer: 'Eskayef Pharmaceuticals Ltd.', category: 'Cough Suppressant' },
  { brandName: 'Bexitrol-F 100 Inhaler', genericName: 'Salmeterol + Fluticasone', strength: '50 mcg + 100 mcg', dosageForm: 'Inhaler', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Antiasthmatic' },
  { brandName: 'Bexitrol-F 250 Inhaler', genericName: 'Salmeterol + Fluticasone', strength: '50 mcg + 250 mcg', dosageForm: 'Inhaler', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Antiasthmatic' },
  { brandName: 'Azmasol Inhaler', genericName: 'Salbutamol', strength: '100 mcg/puff', dosageForm: 'Inhaler', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Bronchodilator' },

  // Antibiotics & Antimicrobials
  { brandName: 'Ciprocin 500', genericName: 'Ciprofloxacin', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antibiotic (Fluoroquinolone)' },
  { brandName: 'Azithrocin 500', genericName: 'Azithromycin', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Antibiotic (Macrolide)' },
  { brandName: 'Zithrin 500', genericName: 'Azithromycin', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antibiotic (Macrolide)' },
  { brandName: 'Moxaclav 625', genericName: 'Amoxicillin + Clavulanic Acid', strength: '500 mg + 125 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antibiotic (Penicillin)' },
  { brandName: 'Cef-3 200', genericName: 'Cefixime', strength: '200 mg', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antibiotic (Cephalosporin)' },
  { brandName: 'Cef-3 400', genericName: 'Cefixime', strength: '400 mg', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antibiotic (Cephalosporin)' },
  { brandName: 'Intracef 500', genericName: 'Cephradine', strength: '500 mg', dosageForm: 'Capsule', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Antibiotic (Cephalosporin)' },
  { brandName: 'Flagyl 400', genericName: 'Metronidazole', strength: '400 mg', dosageForm: 'Tablet', manufacturer: 'Sanofi Bangladesh Ltd.', category: 'Antiprotozoal & Antibacterial' },
  { brandName: 'Filmet 400', genericName: 'Metronidazole', strength: '400 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antiprotozoal & Antibacterial' },

  // Antihypertensives & Cardiovascular
  { brandName: 'Bizoran 5/20', genericName: 'Amlodipine + Olmesartan', strength: '5 mg + 20 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Antihypertensive' },
  { brandName: 'Bizoran 5/40', genericName: 'Amlodipine + Olmesartan', strength: '5 mg + 40 mg', dosageForm: 'Tablet', manufacturer: 'Beximco Pharmaceuticals Ltd.', category: 'Antihypertensive' },
  { brandName: 'Osartil 50', genericName: 'Losartan Potassium', strength: '50 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antihypertensive (ARB)' },
  { brandName: 'Osartil 25', genericName: 'Losartan Potassium', strength: '25 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antihypertensive (ARB)' },
  { brandName: 'Osartil 50 Plus', genericName: 'Losartan + Hydrochlorothiazide', strength: '50 mg + 12.5 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antihypertensive' },
  { brandName: 'Camlosart 5/20', genericName: 'Amlodipine + Olmesartan', strength: '5 mg + 20 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antihypertensive' },
  { brandName: 'Nebita 5', genericName: 'Nebivolol', strength: '5 mg', dosageForm: 'Tablet', manufacturer: 'Healthcare Pharmaceuticals Ltd.', category: 'Beta Blocker' },
  { brandName: 'Cardizem 30', genericName: 'Diltiazem HCl', strength: '30 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Calcium Channel Blocker' },
  { brandName: 'Rostar 10', genericName: 'Rosuvastatin', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Lipid Lowering (Statin)' },
  { brandName: 'Rostar 20', genericName: 'Rosuvastatin', strength: '20 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Lipid Lowering (Statin)' },
  { brandName: 'Atova 10', genericName: 'Atorvastatin', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Lipid Lowering (Statin)' },
  { brandName: 'Ecosprin 75', genericName: 'Aspirin (Enteric Coated)', strength: '75 mg', dosageForm: 'Tablet', manufacturer: 'Acme Laboratories Ltd.', category: 'Antiplatelet' },
  { brandName: 'Anclog 75', genericName: 'Clopidogrel', strength: '75 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antiplatelet' },

  // Antidiabetics
  { brandName: 'Comprid 80', genericName: 'Gliclazide', strength: '80 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antidiabetic (Sulfonylurea)' },
  { brandName: 'Comprid MR 30', genericName: 'Gliclazide MR', strength: '30 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antidiabetic (Sulfonylurea)' },
  { brandName: 'Daonil 5', genericName: 'Glibenclamide', strength: '5 mg', dosageForm: 'Tablet', manufacturer: 'Sanofi Bangladesh Ltd.', category: 'Antidiabetic (Sulfonylurea)' },
  { brandName: 'Metfo 500', genericName: 'Metformin HCl', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antidiabetic (Biguanide)' },
  { brandName: 'Metfo 850', genericName: 'Metformin HCl', strength: '850 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antidiabetic (Biguanide)' },
  { brandName: 'Linatab 5', genericName: 'Linagliptin', strength: '5 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antidiabetic (DPP-4 Inhibitor)' },
  { brandName: 'Linatab M 2.5/500', genericName: 'Linagliptin + Metformin', strength: '2.5 mg + 500 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antidiabetic Combination' },
  { brandName: 'Jardiance 10', genericName: 'Empagliflozin', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Boehringer Ingelheim / Square', category: 'Antidiabetic (SGLT2 Inhibitor)' },
  { brandName: 'Jardiance 25', genericName: 'Empagliflozin', strength: '25 mg', dosageForm: 'Tablet', manufacturer: 'Boehringer Ingelheim / Square', category: 'Antidiabetic (SGLT2 Inhibitor)' },

  // NSAIDs, Muscle Relaxants & Pain Management
  { brandName: 'Torax 10', genericName: 'Ketorolac Tromethamine', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Healthcare Pharmaceuticals Ltd.', category: 'NSAID' },
  { brandName: 'Rolac 10', genericName: 'Ketorolac Tromethamine', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Renata Limited', category: 'NSAID' },
  { brandName: 'Clofenac 50', genericName: 'Diclofenac Sodium', strength: '50 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'NSAID' },
  { brandName: 'Naproxen 500', genericName: 'Naproxen', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'NSAID' },
  { brandName: 'Prebital 50', genericName: 'Pregabalin', strength: '50 mg', dosageForm: 'Capsule', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Neuropathic Pain Agent' },
  { brandName: 'Prebital 75', genericName: 'Pregabalin', strength: '75 mg', dosageForm: 'Capsule', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Neuropathic Pain Agent' },
  { brandName: 'Myolax 50', genericName: 'Tolperisone HCl', strength: '50 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Skeletal Muscle Relaxant' },
  { brandName: 'Baclosign 10', genericName: 'Baclofen', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Skeletal Muscle Relaxant' },

  // Gastrointestinal & Antiemetics
  { brandName: 'Apidon 10', genericName: 'Domperidone', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Healthcare Pharmaceuticals Ltd.', category: 'Prokinetic & Antiemetic' },
  { brandName: 'Motigut 10', genericName: 'Domperidone', strength: '10 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Prokinetic & Antiemetic' },
  { brandName: 'Anset 8', genericName: 'Ondansetron', strength: '8 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antiemetic' },
  { brandName: 'Emistat 8', genericName: 'Ondansetron', strength: '8 mg', dosageForm: 'Tablet', manufacturer: 'Incepta Pharmaceuticals Ltd.', category: 'Antiemetic' },
  { brandName: 'Entacyd Plus', genericName: 'Magaldrate + Simethicone', strength: '200 ml', dosageForm: 'Suspension', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antacid' },
  { brandName: 'Gevisor', genericName: 'Sodium Alginate + Potassium Bicarbonate', strength: '200 ml', dosageForm: 'Suspension', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antacid / Reflux Suppressant' },

  // Vitamins, Minerals & Supplements
  { brandName: 'Filwel Gold', genericName: 'Multivitamins & Multiminerals (A-Z)', strength: '32 Ingredients', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Nutritional Supplement' },
  { brandName: 'Calbo-D', genericName: 'Calcium Carbonate + Vitamin D3', strength: '500 mg + 200 IU', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Calcium & Vitamin D' },
  { brandName: 'Coralcal-D', genericName: 'Coral Calcium + Vitamin D3', strength: '500 mg + 200 IU', dosageForm: 'Tablet', manufacturer: 'Radiant Pharmaceuticals Ltd.', category: 'Calcium & Vitamin D' },
  { brandName: 'D-Rise 20000', genericName: 'Cholecalciferol (Vitamin D3)', strength: '20000 IU', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Vitamin D' },
  { brandName: 'D-Rise 40000', genericName: 'Cholecalciferol (Vitamin D3)', strength: '40000 IU', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Vitamin D' },
  { brandName: 'Xinc 20', genericName: 'Zinc Sulfate Monohydrate', strength: '20 mg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Mineral Supplement' },
  { brandName: 'Neuro-B', genericName: 'Vitamin B1 + B6 + B12', strength: '100 mg + 200 mg + 200 mcg', dosageForm: 'Tablet', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Vitamin B Complex' },
  { brandName: 'Aristovit-M', genericName: 'Multivitamins with Minerals', strength: 'Standard', dosageForm: 'Tablet', manufacturer: 'Aristopharma Ltd.', category: 'Nutritional Supplement' },

  // Topicals, Antifungals & Eye Drops
  { brandName: 'Viodin 10%', genericName: 'Povidone Iodine', strength: '10% w/v', dosageForm: 'Solution', manufacturer: 'Eskayef Pharmaceuticals Ltd.', category: 'Antiseptic', medicineType: 'Allopathic' },
  { brandName: 'Ebercon 1%', genericName: 'Eberconazole', strength: '1% w/w', dosageForm: 'Cream', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antifungal', medicineType: 'Allopathic' },
  { brandName: 'Fungidal 150', genericName: 'Fluconazole', strength: '150 mg', dosageForm: 'Capsule', manufacturer: 'Square Pharmaceuticals Ltd.', category: 'Antifungal', medicineType: 'Allopathic' },
  { brandName: 'Tear Drops', genericName: 'Carboxymethylcellulose Sodium', strength: '0.5% w/v', dosageForm: 'Eye Drops', manufacturer: 'Aristopharma Ltd.', category: 'Ophthalmic Lubricant', medicineType: 'Allopathic' },

  // ==========================================
  // UNANI MEDICINES (ইউনানি চিকিৎসা)
  // Leading Manufacturers: Hamdard Laboratories, Modern Herbal, Ibn Sina Natural
  // ==========================================
  { brandName: 'Cinkara', genericName: 'Herbal Multivitamin & Vital Elements (সিনকারা)', strength: '450 ml', dosageForm: 'Syrup', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'General Tonic & Restorative', medicineType: 'Unani' },
  { brandName: 'Safi', genericName: 'Natural Blood Purifier (সাফি)', strength: '225 ml', dosageForm: 'Syrup', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Blood Purifier & Skin Tonic', medicineType: 'Unani' },
  { brandName: 'Sualin', genericName: 'Glycyrrhiza Glabra + Adhatoda Vasica (সুয়ালিন)', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Cough & Throat Soother', medicineType: 'Unani' },
  { brandName: 'Carmina', genericName: 'Mentha + Trachyspermum Ammi (কারমিনা)', strength: 'Standard', dosageForm: 'Tablet', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Digestive & Carminative', medicineType: 'Unani' },
  { brandName: 'Carmina Syrup', genericName: 'Carminative & Digestive Formula (কারমিনা সিরাপ)', strength: '200 ml', dosageForm: 'Syrup', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Digestive & Antacid', medicineType: 'Unani' },
  { brandName: 'Habbe Suranjan', genericName: 'Colchicum Autumnale Formula (হাবে সুরঞ্জন)', strength: '250 mg', dosageForm: 'Tablet', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Anti-Arthritic & Joint Pain', medicineType: 'Unani' },
  { brandName: 'Majun Arad Khurma', genericName: 'Trapa Bispinosa + Dates Tonic (মাজুন আরদ খুরমা)', strength: '100 g', dosageForm: 'Majun', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Nervine & Vitality Tonic', medicineType: 'Unani' },
  { brandName: 'Khamira Gaozaban', genericName: 'Borago Officinalis Confection (খমিরা গাওজবান)', strength: '100 g', dosageForm: 'Khamira', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Brain & Heart Tonic', medicineType: 'Unani' },
  { brandName: 'Arq Gulab', genericName: 'Rosa Damascena Distillate (আর্কে গোলাপ)', strength: '100 ml', dosageForm: 'Liquid', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Ophthalmic & Skin Tonic', medicineType: 'Unani' },
  { brandName: 'Ispaghol', genericName: 'Plantago Ovata Husk (ইসবগুল ভুসি)', strength: '100 g', dosageForm: 'Powder', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Laxative & Bowel Regulator', medicineType: 'Unani' },
  { brandName: 'Sharbat Rooh Afza', genericName: 'Natural Herbal Refreshing Sharbat (রুহ আফজা)', strength: '750 ml', dosageForm: 'Syrup', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Refrigerant & Vitality', medicineType: 'Unani' },
  { brandName: 'Habbe Asgand', genericName: 'Withania Somnifera (হাবে আসগন্দ)', strength: '500 mg', dosageForm: 'Tablet', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Anti-Rheumatic & Nervine', medicineType: 'Unani' },
  { brandName: 'De-stone', genericName: 'Dolichos Biflorus + Bergenia Ligulata (ডি-স্টোন)', strength: '200 ml', dosageForm: 'Syrup', manufacturer: 'Modern Herbal Group', category: 'Urinary & Kidney Tonic', medicineType: 'Unani' },
  { brandName: 'Gasnol', genericName: 'Herbal Carminative & Antacid (গ্যাসনল)', strength: '500 mg', dosageForm: 'Capsule', manufacturer: 'Modern Herbal Group', category: 'Gastric & Antacid', medicineType: 'Unani' },
  { brandName: 'Hepato-Plus', genericName: 'Cichorium Intybus Complex (হেপাটো প্লাস)', strength: '200 ml', dosageForm: 'Syrup', manufacturer: 'Ibn Sina Natural Medicine', category: 'Hepatoprotective & Liver Care', medicineType: 'Unani' },
  { brandName: 'Safoof Mohazzil', genericName: 'Herbal Slimming Formula (সাফুফ মোহাজ্জিল)', strength: '50 g', dosageForm: 'Powder', manufacturer: 'Hamdard Laboratories (WAQF) Bangladesh', category: 'Metabolic & Weight Management', medicineType: 'Unani' },

  // ==========================================
  // AYURVEDIC MEDICINES (আয়ুর্বেদিক চিকিৎসা)
  // Leading Manufacturers: Sadhana Aushadhalaya, The Ayurvedic Pharmacy (AP), Sri Sri Tattva
  // ==========================================
  { brandName: 'Chyawanprash', genericName: 'Emblica Officinalis (Amla) + 40 Herbs (চ্যাবনাপ্রাশ)', strength: '500 g', dosageForm: 'Avaleha', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Immunity & Rejuvenation (Rasayana)', medicineType: 'Ayurvedic' },
  { brandName: 'Draksharishta', genericName: 'Vitis Vinifera Ferment (দ্রাক্ষারিষ্ট)', strength: '450 ml', dosageForm: 'Arishta', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Digestive & General Restorative', medicineType: 'Ayurvedic' },
  { brandName: 'Ashwagandharishta', genericName: 'Withania Somnifera Ferment (অশ্বগন্ধারিষ্ট)', strength: '450 ml', dosageForm: 'Arishta', manufacturer: 'The Ayurvedic Pharmacy (AP) Ltd.', category: 'Nervine Tonic & Stress Relief', medicineType: 'Ayurvedic' },
  { brandName: 'Dashamularishta', genericName: 'Ten Roots Complex Ferment (দশমূলারিষ্ট)', strength: '450 ml', dosageForm: 'Arishta', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Postpartum & Fatigue Tonic', medicineType: 'Ayurvedic' },
  { brandName: 'Triphala Churna', genericName: 'Haritaki + Bibhitaki + Amalaki (ত্রিফলা চূর্ণ)', strength: '100 g', dosageForm: 'Churna', manufacturer: 'The Ayurvedic Pharmacy (AP) Ltd.', category: 'Detox & Digestive Cleanser', medicineType: 'Ayurvedic' },
  { brandName: 'Amritarishta', genericName: 'Tinospora Cordifolia (Guduchi) (অমৃতারিষ্ট)', strength: '450 ml', dosageForm: 'Arishta', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Antipyretic & Immunity Booster', medicineType: 'Ayurvedic' },
  { brandName: 'Mahasudarshan Churna', genericName: 'Swertia Chirata + 53 Herbs (মহাসুদর্শন চূর্ণ)', strength: '50 g', dosageForm: 'Churna', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Antipyretic & Chronic Fever Remedy', medicineType: 'Ayurvedic' },
  { brandName: 'Yograj Guggulu', genericName: 'Commiphora Mukul Vati (যোগরাজ গুগগুলু)', strength: '250 mg', dosageForm: 'Tablet', manufacturer: 'The Ayurvedic Pharmacy (AP) Ltd.', category: 'Anti-Arthritic & Joint Care', medicineType: 'Ayurvedic' },
  { brandName: 'Kanchanar Guggulu', genericName: 'Bauhinia Variegata + Guggulu (কাঞ্চনার গুগগুলু)', strength: '250 mg', dosageForm: 'Tablet', manufacturer: 'The Ayurvedic Pharmacy (AP) Ltd.', category: 'Lymphatic & Glandular Care', medicineType: 'Ayurvedic' },
  { brandName: 'Kumaryasava', genericName: 'Aloe Vera (Kumari) Ferment (কুমার্যাসভ)', strength: '450 ml', dosageForm: 'Asava', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Liver, Spleen & Digestive Tonic', medicineType: 'Ayurvedic' },
  { brandName: 'Brahmi Ghrita', genericName: 'Bacopa Monnieri Medicated Ghee (ব্রাহ্মী ঘৃত)', strength: '100 g', dosageForm: 'Ghrita', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Cognitive & Memory Enhancer', medicineType: 'Ayurvedic' },
  { brandName: 'Avipattikar Churna', genericName: 'Classical Hyperacidity Formula (অবিপত্তিকর চূর্ণ)', strength: '100 g', dosageForm: 'Churna', manufacturer: 'The Ayurvedic Pharmacy (AP) Ltd.', category: 'Antacid & Hyperacidity Relief', medicineType: 'Ayurvedic' },
  { brandName: 'Maha Narayan Taila', genericName: 'Medicated Sesame Oil with 30 Herbs (মহানாராயণ তৈল)', strength: '100 ml', dosageForm: 'Taila', manufacturer: 'Sadhana Aushadhalaya Ltd.', category: 'Musculoskeletal & Massage Oil', medicineType: 'Ayurvedic' },
  { brandName: 'Vasavaleha', genericName: 'Adhatoda Vasica Herbal Jam (বাসাবলেহ)', strength: '100 g', dosageForm: 'Avaleha', manufacturer: 'The Ayurvedic Pharmacy (AP) Ltd.', category: 'Respiratory & Bronchial Relief', medicineType: 'Ayurvedic' },
  { brandName: 'Neem Capsule', genericName: 'Azadirachta Indica Extract (নিম ক্যাপসুল)', strength: '500 mg', dosageForm: 'Capsule', manufacturer: 'Sri Sri Tattva Bangladesh', category: 'Skin & Blood Purifier', medicineType: 'Ayurvedic' },
];

export const seedDatabase = async (force: boolean = false) => {
  try {
    const existingMedicinesCount = await Medicine.countDocuments();
    const MEDEX_JSON_PATH = path.resolve(__dirname, '../../data/medex/processed/medex_brands.json');

    if (force) {
      console.log('[Seed] Force flag active. Clearing existing collection data...');
      await Promise.all([
        User.deleteMany({}),
        Doctor.deleteMany({}),
        Chamber.deleteMany({}),
        Patient.deleteMany({}),
        Medicine.deleteMany({}),
        Template.deleteMany({}),
        Prescription.deleteMany({}),
        AuditLog.deleteMany({}),
      ]);
    }

    // Seed Medicines if empty or under 1000 records
    if (existingMedicinesCount < 1000 || force) {
      console.log('[Seed] Seeding medicines database...');
      
      // 1. If MedEx cleaned dataset exists, batch insert all 25k+ records
      if (fs.existsSync(MEDEX_JSON_PATH)) {
        try {
          const medexRaw = JSON.parse(fs.readFileSync(MEDEX_JSON_PATH, 'utf8'));
          if (Array.isArray(medexRaw) && medexRaw.length > 0) {
            console.log(`[Seed] Found MedEx Allopathic dataset with ${medexRaw.length} medicines. Loading into database...`);
            
            const docsToInsert = medexRaw.map((m: any) => ({
              brandName: m.brandName?.trim() || 'Unknown',
              genericName: m.genericName?.trim() || 'General',
              strength: m.strength?.trim() || 'N/A',
              dosageForm: m.dosageForm?.trim() || 'Tablet',
              manufacturer: m.manufacturer?.trim() || 'General',
              category: 'General',
              medicineType: 'Allopathic',
              status: 'active',
            }));

            // Chunk in batches of 2500 for fast insertion
            const CHUNK_SIZE = 2500;
            for (let i = 0; i < docsToInsert.length; i += CHUNK_SIZE) {
              const chunk = docsToInsert.slice(i, i + CHUNK_SIZE);
              await Medicine.insertMany(chunk, { ordered: false });
            }
            console.log(`[Seed] ✅ Successfully loaded ${docsToInsert.length} MedEx medicines into database!`);
          }
        } catch (medexErr: any) {
          console.warn('[Seed] Warning loading MedEx dataset, falling back to popular list:', medexErr.message);
        }
      }

      // 2. Also seed Popular Bangladeshi herbal, unani and ayurvedic medicines
      await Medicine.insertMany(
        POPULAR_BANGLADESH_MEDICINES.map((m: any) => ({
          medicineType: m.medicineType || 'Allopathic',
          ...m,
          status: 'active',
        }))
      );
      console.log(`[Seed] Seeded ${POPULAR_BANGLADESH_MEDICINES.length} popular Bangladeshi medicines (Allopathic, Unani & Ayurvedic).`);
    } else {
      console.log(`[Seed] Database already seeded with ${existingMedicinesCount} medicines.`);
    }

    // 3. Ensure MedEx Herbal, Unani & Ayurvedic medicines are seeded
    const MEDEX_HERBAL_PATH = path.resolve(__dirname, '../../data/medex/processed/medex_all_herbal_brands.json');
    const existingHerbalCount = await Medicine.countDocuments({
      medicineType: { $in: ['Unani', 'Ayurvedic', 'Herbal'] },
    });

    if (existingHerbalCount < 100 || force) {
      if (fs.existsSync(MEDEX_HERBAL_PATH)) {
        try {
          const herbalRaw = JSON.parse(fs.readFileSync(MEDEX_HERBAL_PATH, 'utf8'));
          if (Array.isArray(herbalRaw) && herbalRaw.length > 0) {
            console.log(`[Seed] Found MedEx Herbal/Traditional dataset with ${herbalRaw.length} medicines. Loading into database...`);

            const docsToInsert = herbalRaw.map((m: any) => ({
              brandName: m.brandName?.trim() || 'Unknown',
              genericName: m.genericName?.trim() || 'General',
              strength: m.strength?.trim() || 'N/A',
              dosageForm: m.dosageForm?.trim() || 'Herbal Preparation',
              manufacturer: m.manufacturer?.trim() || 'General',
              category: m.medicineType || 'Herbal',
              medicineType: m.medicineType || 'Herbal',
              status: 'active',
            }));

            // Bulk upsert or insert to prevent duplicates with existing
            const bulkOps = docsToInsert.map((d: any) => ({
              updateOne: {
                filter: {
                  brandName: d.brandName,
                  strength: d.strength,
                  genericName: d.genericName,
                  manufacturer: d.manufacturer,
                },
                update: {
                  $set: d,
                  $setOnInsert: { createdAt: new Date() },
                },
                upsert: true,
              },
            }));

            const result = await Medicine.bulkWrite(bulkOps, { ordered: false });
            const unaniCount = docsToInsert.filter((d: any) => d.medicineType === 'Unani').length;
            const ayurvedicCount = docsToInsert.filter((d: any) => d.medicineType === 'Ayurvedic').length;
            const herbalCount = docsToInsert.filter((d: any) => d.medicineType === 'Herbal').length;

            console.log(
              `[Seed] ✅ Loaded MedEx Traditional Medicines! (Upserted: ${result.upsertedCount}, Matched: ${result.matchedCount})`
            );
            console.log(
              `[Seed] 📊 Totals: ${unaniCount} Unani, ${ayurvedicCount} Ayurvedic, ${herbalCount} Herbal.`
            );
          }
        } catch (herbalErr: any) {
          console.warn('[Seed] Warning loading MedEx herbal dataset:', herbalErr.message);
        }
      }
    } else {
      console.log(`[Seed] Herbal/Traditional medicines already loaded (${existingHerbalCount} records).`);
    }

    // Check if demo users already exist
    const existingUsersCount = await User.countDocuments();
    if (existingUsersCount > 0 && !force) {
      return;
    }

    // 1. Create Admin User
    const adminSalt = await bcrypt.genSalt(10);
    const adminPasswordHash = await bcrypt.hash('Admin123!', adminSalt);
    const adminUser = await User.create({
      name: 'System Administrator',
      email: 'admin@prescription.com',
      phone: '01700000000',
      passwordHash: adminPasswordHash,
      role: 'admin',
      status: 'active',
    });

    // 2. Create Demo Doctor (Dr. Moshfiqur Rahman)
    const doctorSalt = await bcrypt.genSalt(10);
    const doctorPasswordHash = await bcrypt.hash('Doctor123!', doctorSalt);
    const doctorUser = await User.create({
      name: 'Dr. Moshfiqur Rahman',
      email: 'doctor@prescription.com',
      phone: '01712345678',
      passwordHash: doctorPasswordHash,
      role: 'doctor',
      status: 'active',
    });

    const doctor = await Doctor.create({
      userId: doctorUser._id,
      name: 'Dr. Moshfiqur Rahman',
      qualification: 'MBBS (DMC), FCPS (Medicine), CCD (BIRDEM), MACP (USA)',
      specialization: 'Consultant Physician & Diabetologist',
      bmdcNumber: 'A-54321',
      designation: 'Associate Professor, Department of Medicine',
      workplace: 'Dhaka Medical College & Hospital',
      phone: '+880 1712-345678',
      email: 'doctor@prescription.com',
      settings: {
        paperSize: 'A4',
        defaultLanguage: 'en',
        defaultFollowUp: '7 days',
        headerVisibility: true,
        footerVisibility: true,
        themeColor: '#008ba3',
        showWatermark: true,
        showQrCode: true,
      },
    });

    // 3. Create Chambers
    const chamber1 = await Chamber.create({
      doctorId: doctor._id,
      name: 'Dhanmondi Specialized Chamber',
      address: 'Suite #402, House #42, Road #7/A, Dhanmondi, Dhaka-1209',
      phone: '+880 2-9661234',
      appointmentPhone: '+880 1819-001122',
      visitingDays: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'],
      visitingHours: '5:00 PM - 9:00 PM',
      roomNo: 'Room 402 (4th Floor)',
      isDefault: true,
      status: 'active',
    });

    const chamber2 = await Chamber.create({
      doctorId: doctor._id,
      name: 'Uttara Consultation Center',
      address: 'Plot #15, Sector #4, Uttara Model Town, Dhaka-1230',
      phone: '+880 2-8951234',
      appointmentPhone: '+880 1912-334455',
      visitingDays: ['Thu', 'Fri'],
      visitingHours: '6:00 PM - 10:00 PM',
      roomNo: 'Chamber 12 (2nd Floor)',
      isDefault: false,
      status: 'active',
    });

    doctor.defaultChamberId = chamber1._id as any;
    await doctor.save();

    // 4. Create Standard Clinical Templates
    await Template.create([
      {
        doctorId: doctor._id,
        name: 'Common Cold & Viral Fever',
        category: 'Infectious & General',
        description: 'Standard protocol for acute viral upper respiratory tract infection and fever',
        chiefComplaints: [
          { complaint: 'Fever with body ache', duration: '3 days' },
          { complaint: 'Runny nose and sneezing', duration: '2 days' },
          { complaint: 'Dry cough', duration: '2 days' },
        ],
        diagnosis: [{ name: 'Viral Upper Respiratory Tract Infection (URTI)', icdCode: 'J06.9' }],
        medicines: [
          {
            brandName: 'Napa Extra',
            genericName: 'Paracetamol + Caffeine',
            dosageForm: 'Tablet',
            strength: '500 mg + 65 mg',
            dose: '1 tablet',
            frequency: '1+1+1',
            duration: '3 to 5 days',
            instruction: 'After meal (জ্বর বা ব্যথা থাকলে)',
          },
          {
            brandName: 'Fexo 120',
            genericName: 'Fexofenadine HCl',
            dosageForm: 'Tablet',
            strength: '120 mg',
            dose: '1 tablet',
            frequency: '0+0+1',
            duration: '7 days',
            instruction: 'At bedtime (রাতে শোবার আগে)',
          },
          {
            brandName: 'Seclo 20',
            genericName: 'Omeprazole',
            dosageForm: 'Capsule',
            strength: '20 mg',
            dose: '1 capsule',
            frequency: '1+0+1',
            duration: '7 days',
            instruction: 'Before meal (খাবার ২০ মিনিট আগে)',
          },
        ],
        investigations: ['CBC with ESR', 'Urine R/M/E', 'Dengue NS1 Antigen (if fever persists > 3 days)'],
        advice: [
          'Drink plenty of warm boiled water (প্রতিদিন প্রচুর কুসুম গরম পানি পান করুন)',
          'Take adequate physical rest (পর্যাপ্ত বিশ্রাম নিন)',
          'Normal salt-water gargle 3-4 times daily (লবণ-গরম পানির গার্গল করুন)',
          'Avoid cold drinks and ice cream (ঠান্ডা পানীয় ও আইসক্রিম পরিহার করুন)',
        ],
        followUpDuration: '5 days',
      },
      {
        doctorId: doctor._id,
        name: 'Acute Gastritis & GERD Protocol',
        category: 'Gastroenterology',
        description: 'Management for hyperacidity, epigastric burning pain, and heartburn',
        chiefComplaints: [
          { complaint: 'Epigastric burning pain & fullness', duration: '5 days' },
          { complaint: 'Sour belching & heartburn', duration: '1 week' },
        ],
        diagnosis: [{ name: 'Gastro-esophageal Reflux Disease (GERD)', icdCode: 'K21.9' }],
        medicines: [
          {
            brandName: 'Maxpro 20',
            genericName: 'Esomeprazole',
            dosageForm: 'Tablet',
            strength: '20 mg',
            dose: '1 tablet',
            frequency: '1+0+1',
            duration: '14 days',
            instruction: 'Before meal (সকাল ও রাতে খাবার ৩০ মিনিট আগে)',
          },
          {
            brandName: 'Apidon 10',
            genericName: 'Domperidone',
            dosageForm: 'Tablet',
            strength: '10 mg',
            dose: '1 tablet',
            frequency: '1+1+1',
            duration: '7 days',
            instruction: 'Before meal (খাবার ১৫ মিনিট আগে)',
          },
          {
            brandName: 'Gevisor',
            genericName: 'Sodium Alginate + Potassium Bicarbonate',
            dosageForm: 'Suspension',
            strength: '200 ml',
            dose: '2 teaspoonful',
            frequency: '1+1+1',
            duration: '7 days',
            instruction: 'After meal & at bedtime (খাবারের পর)',
          },
        ],
        investigations: ['USG of Whole Abdomen', 'Serum SGPT (ALT)', 'Endoscopy of Upper GI Tract (if indicated)'],
        advice: [
          'Avoid oily, spicy, fried and junk food (অতিরিক্ত তেল, ঝাল ও ভাজাপোড়া খাবার বাদ দিন)',
          'Do not lie down immediately after meal (খাওয়ার সাথে সাথেই শুয়ে পড়বেন না)',
          'Eat small meals at regular intervals (একবারে বেশি না খেয়ে অল্প অল্প করে বারবার খান)',
        ],
        followUpDuration: '14 days',
      },
      {
        doctorId: doctor._id,
        name: 'Essential Hypertension & Dyslipidemia',
        category: 'Cardiology',
        description: 'Initial combination therapy for newly diagnosed primary hypertension',
        chiefComplaints: [
          { complaint: 'Occipital headache & dizziness', duration: '2 weeks' },
          { complaint: 'High blood pressure on screening (BP: 160/95 mmHg)', duration: '1 day' },
        ],
        diagnosis: [
          { name: 'Essential (Primary) Hypertension', icdCode: 'I10' },
          { name: 'Mixed Dyslipidemia', icdCode: 'E78.2' },
        ],
        medicines: [
          {
            brandName: 'Bizoran 5/20',
            genericName: 'Amlodipine + Olmesartan',
            dosageForm: 'Tablet',
            strength: '5 mg + 20 mg',
            dose: '1 tablet',
            frequency: '0+1+0',
            duration: 'Continue (চলবে)',
            instruction: 'After lunch (দুপুরে খাবার পর)',
          },
          {
            brandName: 'Rostar 10',
            genericName: 'Rosuvastatin',
            dosageForm: 'Tablet',
            strength: '10 mg',
            dose: '1 tablet',
            frequency: '0+0+1',
            duration: 'Continue (চলবে)',
            instruction: 'At bedtime (রাতে খাবার পর)',
          },
        ],
        investigations: [
          'Fasting Lipid Profile',
          'Serum Creatinine & Electrolytes',
          'Fasting Blood Sugar (FBS) & HbA1c',
          'ECG (12 Lead)',
          'Urine for Microalbumin',
        ],
        advice: [
          'Strict low-salt diet. Avoid extra raw salt (পাতে কাঁচা লবণ একেবারেই খাওয়া নিষেধ)',
          'Avoid red meat, beef, mutton, and fatty foods (গরু ও খাসির মাংস পরিহার করুন)',
          'Brisk walking for 30-40 minutes daily (প্রতিদিন ৩০-৪০ মিনিট হাঁটুন)',
          'Monitor BP every 3 days and record in chart (৩ দিন পর পর রক্তচাপ মেপে লিখে রাখুন)',
        ],
        followUpDuration: '14 days',
      },
    ]);

    // 5. Create Sample Patients
    const patient1 = await Patient.create({
      patientId: 'PAT-2026-0001',
      doctorId: doctor._id,
      name: 'Mohammad Abdul Karim',
      phone: '01711223344',
      email: 'karim.abdul@example.com',
      age: 54,
      gender: 'Male',
      bloodGroup: 'B+',
      address: 'House #12, Road #4, Dhanmondi, Dhaka',
      emergencyContact: 'Son: 01799887766',
      allergies: ['Penicillin', 'Sulfa drugs'],
      medicalHistory: ['Hypertension (5 years)', 'Type 2 Diabetes Mellitus (3 years)'],
      notes: 'Compliant patient, regular follow-up',
      lastVisit: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      lastDiagnosis: 'Essential (Primary) Hypertension, Type 2 Diabetes Mellitus',
    });

    const patient2 = await Patient.create({
      patientId: 'PAT-2026-0002',
      doctorId: doctor._id,
      name: 'Nusrat Jahan Chowdhury',
      phone: '01819998877',
      email: 'nusrat.jahan@example.com',
      age: 28,
      gender: 'Female',
      bloodGroup: 'O+',
      address: 'Sector #7, Road #11, Uttara, Dhaka',
      allergies: ['Dust & Cold'],
      medicalHistory: ['Allergic Rhinitis', 'Occasional Migraine'],
      notes: 'Sensitive to NSAIDs',
      lastVisit: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      lastDiagnosis: 'Acute Bronchitis & Allergic Rhinitis',
    });

    const patient3 = await Patient.create({
      patientId: 'PAT-2026-0003',
      doctorId: doctor._id,
      name: 'Tanvir Ahmed',
      phone: '01912345600',
      age: 41,
      gender: 'Male',
      bloodGroup: 'A+',
      address: 'Mirpur-10, Dhaka',
      allergies: [],
      medicalHistory: ['Hyperacidity & Peptic Ulcer'],
      lastVisit: new Date(),
      lastDiagnosis: 'Gastro-esophageal Reflux Disease (GERD)',
    });

    // 6. Create Historical Prescriptions
    await Prescription.create({
      prescriptionId: 'RX-2026-000101',
      doctorId: doctor._id,
      chamberId: chamber1._id,
      patientId: patient1._id,
      patientSnapshot: {
        patientId: patient1.patientId,
        name: patient1.name,
        age: patient1.age,
        gender: patient1.gender,
        phone: patient1.phone,
        bloodGroup: patient1.bloodGroup,
        allergies: patient1.allergies,
      },
      doctorSnapshot: {
        name: doctor.name,
        qualification: doctor.qualification,
        specialization: doctor.specialization,
        bmdcNumber: doctor.bmdcNumber,
        phone: doctor.phone,
        email: doctor.email,
        chamberName: chamber1.name,
        chamberAddress: chamber1.address,
      },
      vitals: {
        bpSystolic: 145,
        bpDiastolic: 90,
        pulse: 78,
        temperature: 98.4,
        spo2: 98,
        weight: 76,
        height: 172,
        bmi: 25.7,
      },
      chiefComplaints: [
        { complaint: 'Occasional mild headache in the morning', duration: '1 week' },
        { complaint: 'Tiredness and weakness', duration: '2 weeks' },
      ],
      history: 'Known case of HTN and T2DM on oral medication.',
      examination: 'Anemia: absent, Jaundice: absent, Edema: absent. Chest: Clear, Heart: S1+S2 heard.',
      diagnosis: [
        { name: 'Essential (Primary) Hypertension', icdCode: 'I10', type: 'confirmed' },
        { name: 'Type 2 Diabetes Mellitus', icdCode: 'E11.9', type: 'confirmed' },
      ],
      medicines: [
        {
          brandName: 'Bizoran 5/20',
          genericName: 'Amlodipine + Olmesartan',
          dosageForm: 'Tablet',
          strength: '5 mg + 20 mg',
          dose: '1 tablet',
          frequency: '0+1+0',
          duration: 'Continue (চলবে)',
          instruction: 'After lunch (দুপুরে খাওয়ার পর)',
          order: 0,
        },
        {
          brandName: 'Metfo 500',
          genericName: 'Metformin HCl',
          dosageForm: 'Tablet',
          strength: '500 mg',
          dose: '1 tablet',
          frequency: '1+0+1',
          duration: 'Continue (চলবে)',
          instruction: 'With meal (খাবারের সাথে)',
          order: 1,
        },
        {
          brandName: 'Rostar 10',
          genericName: 'Rosuvastatin',
          dosageForm: 'Tablet',
          strength: '10 mg',
          dose: '1 tablet',
          frequency: '0+0+1',
          duration: 'Continue (চলবে)',
          instruction: 'At bedtime (রাতে শোবার আগে)',
          order: 2,
        },
      ],
      investigations: ['Fasting Blood Sugar & 2 hrs ABF', 'HbA1c', 'Serum Creatinine', 'Lipid Profile'],
      advice: [
        'Strictly avoid extra raw salt in meals (খাবারে বাড়তি কাঁচা লবণ বর্জন করুন)',
        'Avoid sugar, sweets, cold drinks, and high-carb food (মিষ্টি ও চিনিজাতীয় খাবার বাদ দিন)',
        '30 minutes brisk walking daily in morning/evening (প্রতিদিন ৩০ মিনিট হাঁটুন)',
      ],
      followUp: { duration: '1 month', notes: 'Check BP and Blood Sugar chart on next visit.' },
      status: 'FINALIZED',
      finalizedAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      shareToken: crypto.randomBytes(24).toString('hex'),
      version: 1,
    });

    console.log('[Seed] Demo data successfully initialized!');
    console.log('[Seed] Default Doctor: doctor@prescription.com / Doctor123!');
    console.log('[Seed] Default Admin:  admin@prescription.com  / Admin123!');
  } catch (error) {
    console.error('[Seed] Database seeding failed:', error);
  }
};

// If run directly via CLI `tsx src/seeds/seed.ts`
if (require.main === module) {
  (async () => {
    await connectDatabase();
    await seedDatabase(true);
    await closeDatabase();
    process.exit(0);
  })();
}
