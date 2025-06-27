#!/usr/bin/env python3
"""
HL7 Message Simulator for RadScheduler
Sends realistic HL7 SIU (Scheduling) messages for demo
"""

import socket
import time
import random
import sys
from datetime import datetime, timedelta

class HL7Simulator:
    def __init__(self, host='localhost', port=8661):
        self.host = host
        self.port = port
        self.message_count = 0
        
    def create_hl7_message(self, patient_name="Test Patient", mrn=None, modality="MRI"):
        """Create a realistic HL7 SIU^S12 (New Appointment) message"""
        self.message_count += 1
        
        # Generate IDs
        if not mrn:
            mrn = f"MRN{random.randint(100000, 999999)}"
        
        message_id = f"MSG{self.message_count:06d}"
        
        # Current timestamp
        timestamp = datetime.now().strftime("%Y%m%d%H%M%S")
        
        # Appointment time (2 hours from now)
        apt_time = datetime.now() + timedelta(hours=2)
        apt_timestamp = apt_time.strftime("%Y%m%d%H%M")
        
        # Build HL7 segments
        segments = []
        
        # MSH - Message Header
        segments.append(
            f"MSH|^~\\&|RIS|MEMORIAL|RADSCHED|RAD|{timestamp}||SIU^S12|{message_id}|P|2.5"
        )
        
        # SCH - Schedule Activity Information
        segments.append(
            f"SCH||{random.randint(1000, 9999)}|||||||30|MIN|^^30^{apt_timestamp}^^R||||||||||||||SCHEDULED"
        )
        
        # PID - Patient Identification
        last_name, first_name = patient_name.split(' ') if ' ' in patient_name else (patient_name, "Test")
        segments.append(
            f"PID|1||{mrn}||{last_name}^{first_name}||19800101|M|||123 Main St^^Boston^MA^02101||617-555-0123"
        )
        
        # RGS - Resource Group
        segments.append(f"RGS|1|A")
        
        # AIS - Appointment Information - Service
        study_codes = {
            "MRI": "MRI001^MRI BRAIN W/O CONTRAST",
            "CT": "CT002^CT CHEST W CONTRAST",
            "XRAY": "XR003^CHEST XRAY 2 VIEWS",
            "US": "US004^ABDOMINAL ULTRASOUND"
        }
        study_code = study_codes.get(modality, "MRI001^MRI BRAIN W/O CONTRAST")
        segments.append(f"AIS|1|A|{study_code}|{apt_timestamp}")
        
        # AIP - Appointment Information - Personnel
        segments.append(f"AIP|1|A|RADIOLOGIST^DOE^JOHN^MD|{apt_timestamp}")
        
        # Join segments with carriage return
        message = '\r'.join(segments)
        
        # Add MLLP wrapper (Start Block + Message + End Block + Carriage Return)
        wrapped_message = f"\x0B{message}\x1C\x0D"
        
        return wrapped_message.encode('utf-8')
    
    def send_message(self, message):
        """Send HL7 message via TCP"""
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect((self.host, self.port))
            sock.send(message)
            
            # Wait for ACK
            response = sock.recv(1024)
            sock.close()
            
            return True, response.decode('utf-8', errors='ignore')
        except Exception as e:
            return False, str(e)
    
    def send_test_appointment(self, patient_name=None, modality=None):
        """Send a single test appointment"""
        if not patient_name:
            names = ["John Doe", "Jane Smith", "Robert Johnson", "Mary Williams", "David Brown"]
            patient_name = random.choice(names)
        
        if not modality:
            modality = random.choice(["MRI", "CT", "XRAY", "US"])
        
        message = self.create_hl7_message(patient_name, None, modality)
        
        print(f"Sending HL7 message for {patient_name} - {modality}")
        print(f"Message preview: {message[:100]}...")
        
        success, response = self.send_message(message)
        
        if success:
            print(f"Success! Response: {response[:100]}")
        else:
            print(f"Failed: {response}")
        
        return success
    
    def run_demo_scenario(self, scenario="random"):
        """Run specific demo scenarios"""
        if scenario == "dramatic-save":
            # John Doe with contrast allergy
            print("\n=== DRAMATIC SAVE SCENARIO ===")
            print("Sending appointment for John Doe - MRI with contrast...")
            time.sleep(1)
            self.send_test_appointment("John Doe", "MRI")
            
        elif scenario == "efficiency-boost":
            # Send multiple appointments quickly
            print("\n=== EFFICIENCY BOOST SCENARIO ===")
            print("Sending burst of appointments...")
            for i in range(5):
                self.send_test_appointment()
                time.sleep(0.5)
        
        elif scenario == "load-test":
            # Heavy load for impressive metrics
            print("\n=== LOAD TEST SCENARIO ===")
            print("Sending 100 appointments...")
            for i in range(100):
                self.send_test_appointment()
                if i % 10 == 0:
                    print(f"Progress: {i}/100")
                time.sleep(0.1)
        
        else:
            # Random appointment
            self.send_test_appointment()

def main():
    """Main entry point"""
    simulator = HL7Simulator()
    
    if len(sys.argv) > 1:
        scenario = sys.argv[1]
        simulator.run_demo_scenario(scenario)
    else:
        print("Usage: python send-hl7.py [scenario]")
        print("Scenarios: dramatic-save, efficiency-boost, load-test, random")
        print("\nSending random appointment...")
        simulator.send_test_appointment()

if __name__ == "__main__":
    main()