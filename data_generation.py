import logging
import json
import random
import time
from threading import Timer
from pytz import UTC
from kafka import KafkaProducer
from datetime import datetime, timedelta
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker


# Create a custom logging handler
class JsonFileHandler(logging.FileHandler):
    def emit(self, record):
        log_entry = self.format(record)
        with open(self.baseFilename, 'a') as f:
            f.write(log_entry + '\n')


# Set up the logger
logger = logging.getLogger('jsonLogger')
logger.setLevel(logging.DEBUG)

# Create a file handler that logs messages in JSON format
json_handler = JsonFileHandler('json_logs.log')
json_handler.setLevel(logging.DEBUG)


# Create a custom formatter
class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_record = {
            'Username': record.username,
            'Log_id': record.log_id,
            'Timestamp': datetime.now(UTC).isoformat(),
            'Values': record.values
        }
        return json.dumps(log_record)


json_handler.setFormatter(JsonFormatter())
logger.addHandler(json_handler)


# Log messages with the fixed JSON structure

def log_admission(new_event):
    logger.info('', extra={
        'username': 'sneha',
        'log_id': new_event['event_id'],
        'values': {
            'iserrorlog': 0,
            'event_type': new_event['event_type'],
            'department': new_event['details']['department'],
            'time': new_event['timestamp']
        }
    })


def log_billing(new_event):
    logger.info('', extra={
        'username': 'sneha',
        'log_id': new_event['event_id'],
        'values': {
            'iserrorlog': 0,
            'event_type': new_event['event_type'],
            'department': new_event['details']['department'],
            'amount': new_event['details']['amount'],
            'time': new_event['timestamp']
        }
    })


def log_overflow(new_event):
    logger.info('', extra={
        'username': 'sneha',
        'log_id': new_event['event_id'],
        'values': {
            'iserrorlog': 0,
            'event_type': new_event['event_type'],
            'department': new_event['details']['department'] if new_event['details']['department'] else "no discharge",
            'time': new_event['timestamp']
        }
    })


# Kafka producer setup
producer = KafkaProducer(bootstrap_servers='localhost:9092', value_serializer=lambda v: json.dumps(v).encode('utf-8'))

engine = sa.create_engine(
    'mssql+pyodbc://@4BCGLQ2/Hospital_db?driver=ODBC+Driver+17+for+SQL+Server&Trusted_Connection=yes')
Session = sessionmaker(bind=engine)

allocated_patients_details = {}
discharged_patients_details = {}
billing_patient = set()
events = []


def get_last_event():
    session = Session()
    last_event = session.execute(sa.text("""
        SELECT TOP 1 * FROM HospitalEvents
        ORDER BY event_id DESC
    """)).fetchone()
    session.close()
    if last_event:
        return {
            'event_id': last_event.event_id,
            'timestamp': last_event.timestamp.isoformat(),
            'event_type': last_event.event_type,
            'details': {
                'patient_id': last_event.patient_id,
                'department': last_event.department,
                'bed_id': last_event.bed_id
            }
        }
    return None


def get_current_state():
    session = Session()
    #  SELECT patient_id, department, bed_id, age, gender FROM HospitalEvents group by patient_id, department, bed_id, age, gender HAVING COUNT(*) = 1 ;
    allocated_patients_details_list = list(session.execute(sa.text("""
        SELECT he1.* FROM HospitalEvents he1 LEFT JOIN HospitalEvents he2 ON 
        he1.patient_id = he2.patient_id AND he2.event_type = 'discharge' AND he2.timestamp > he1.timestamp WHERE he1.event_type = 'admission' AND he2.patient_id IS NULL

    """)).fetchall())

    for event in allocated_patients_details_list:
        allocated_patients_details[event.patient_id] = {
            'patient_id': event.patient_id,
            'department': event.department,
            'admission_reason': "",
            'bed_id': event.bed_id,
            "age": event.age,
            "gender": event.gender
        }

    discharged_patients_details_list = list(session.execute(sa.text("""
        SELECT patient_id, department, bed_id,discharge_summary, age, gender FROM HospitalEvents WHERE event_type = 'discharge' group by patient_id, department, bed_id,discharge_summary, age, gender ;
    """)).fetchall())

    for event in discharged_patients_details_list:
        discharged_patients_details[event.patient_id] = {
            'patient_id': event.patient_id,
            'discharge_summary': event.discharge_summary,
            'department': event.department,
            'bed_id': event.bed_id,
            "age": event.age,
            "gender": event.gender
        }

    billing_patient = set(session.execute(sa.text("""
        SELECT patient_id FROM HospitalEvents WHERE event_type = 'billing' group by patient_id, department, bed_id,discharge_summary, age, gender ;
    """)).fetchall())

    for event in discharged_patients_details_list:
        discharged_patients_details[event.patient_id] = {
            'patient_id': event.patient_id,
            'discharge_summary': event.discharge_summary,
            'department': event.department,
            'bed_id': event.bed_id,
            "age": event.age,
            "gender": event.gender
        }

    session.close()

    return allocated_patients_details, discharged_patients_details, billing_patient

def get_available_bed(department):
    available_beds = [bed for bed, patient in beds_per_department[department].items() if patient is None]
    return random.choice(available_beds) if available_beds else None


# # Functions for tracking counts
# def get_admitted_patient_count():
#     return len(allocated_patients_details)
#
# def get_discharged_patient_count():
#     return len(discharged_patients_details)
#
# def get_available_bed_count():
#     return sum(sum(1 for patient in dept.values() if patient is None) for dept in beds_per_department.values())
#
# def get_occupied_bed_count():
#     return sum(sum(1 for patient in dept.values() if patient is not None) for dept in beds_per_department.values())
#
#
# # New function for data integrity checks
# def check_data_integrity():
#     assert get_admitted_patient_count() == get_occupied_bed_count(), "Mismatch between admitted patients and occupied beds"
#     assert get_available_bed_count() + get_occupied_bed_count() == 40, "Total bed count mismatch"
#     for dept, beds in beds_per_department.items():
#         assert sum(1 for bed in beds.values() if bed is not None) == sum(1 for patient in allocated_patients_details.values() if patient['department'] == dept), f"Mismatch in {dept} department"

# Function to generate a random event
def generate_event(event_id, current_time, allocated_patients_details, discharged_patients_details):
    event_types = ['admission', 'discharge']
    event_type = random.choice(event_types)

    # Generate event details based on the type
    event_details = {
        'event_id': event_id,
        'timestamp': (current_time).isoformat(),
        'event_type': event_type,
        'details': {}
    }

    if event_type == 'admission':
        patient_id = random.randint(1000, 9999)
        while patient_id in allocated_patients_details:
            patient_id = random.randint(1000, 9999)

        department = random.choice(['cardiology', 'neurology', 'orthopedics', 'pediatrics'])
        # flag = 0
        # for bed in range (1,11):
        #     flag1 = 0
        #     for data in allocated_patients_details.values():
        #         # print("data ------", data)
        #         if(data['bed_id'] == bed and data['department'] == department):
        #             flag1 = 1
        #             break
        #     if(flag1 == 0):
        #         flag = bed
        #         break

        # if flag:
        #     bed_id = flag
        available_beds = set(range(1, 11)) - {data['bed_id'] for data in allocated_patients_details.values() if
                                              data['department'] == department}

        if available_beds:
            bed_id = random.choice(list(available_beds))

            event_details['details'] = {
                'patient_id': patient_id,
                'department': department,
                'admission_reason': random.choice(['checkup', 'emergency', 'surgery']),
                'bed_id': bed_id,
                "age": random.randint(1, 90),
                "gender": random.choice(['Male', 'Female', 'Unknown'])
            }
            allocated_patients_details[patient_id] = event_details['details']
        else:
            event_details['event_type'] = 'No_beds'
            event_details['details'] = {'message': 'No beds available for admission', 'department': department}
    elif event_type == 'discharge':
        if allocated_patients_details:
            patient_id = random.choice(list(allocated_patients_details.keys()))
            # allocated_patients_details.remove(patient_id)
            event_details['details'] = {
                'patient_id': patient_id,
                'discharge_summary': random.choice(['stable', 'not_stable']),
                'department': allocated_patients_details[patient_id]['department'],
                'bed_id': allocated_patients_details[patient_id]['bed_id'],
                'age': allocated_patients_details[patient_id]['age'],
                'gender': allocated_patients_details[patient_id]['gender']
            }
            discharged_patients_details[patient_id] = event_details['details']
            del allocated_patients_details[patient_id]

        else:
            event_details['event_type'] = 'No_discharge'
            event_details['details'] = {'message': 'No patients available for discharge'}


    return event_details


# Initialize the first event
initial_event = {
    'event_id': 1,
    'timestamp': (datetime.now() - timedelta(days=7)).isoformat(),
    'event_type': 'admission',
    'details': {
        'patient_id': random.randint(1000, 9999),
        'department': 'orthopedics',
        'admission_reason': 'initial admission',
        'bed_id': 1,
        "age": random.randint(1, 90),
        "gender": random.choice(['Male', 'Female', 'Unknown'])

    }
}


def generate_billing_event(event, event_id):
    billing_event = {
        'event_id': event_id,
        'timestamp': event['timestamp'],
        'event_type': 'billing',
        'details': {
            'patient_id': event['details']['patient_id'],
            'department': event['details']['department'],
            'amount': random.uniform(1000, 10000),
            'billing_reason': random.choice(['treatment', 'medication']),
            'bed_id': event['details']['bed_id']
        }
    }
    return billing_event


def generate_historical_data():
    last_event = get_last_event()
    if last_event:
        print("Historical data already exists. Skipping historical data generation.")
        return last_event['event_id']

    # Generate historical events (similar to your original code)
    initial_event = {
        'event_id': 1,
        'timestamp': (datetime.now() - timedelta(days=7)).isoformat(),
        'event_type': 'admission',
        'details': {
            'patient_id': random.randint(1000, 9999),
            'department': 'orthopedics',
            'admission_reason': 'initial admission',
            'bed_id': 1,
            'age': random.randint(1, 90),
            'gender': random.choice(['Male', 'Female', 'Unknown'])
        }
    }

    events = [initial_event]
    allocated_patients_details[initial_event['details']['patient_id']] = initial_event['details']
    producer.send('hospital_events', initial_event)
    print(json.dumps(initial_event, indent=4))
    event_id = 2

    day = 6
    current_time = datetime.now() - timedelta(days=7)
    end_time = datetime.now()

    while current_time < end_time:
        daily_events = 0
        while daily_events < 10 and current_time < end_time:
            new_event = generate_event(event_id, current_time + timedelta(minutes=10), allocated_patients_details,
                                       discharged_patients_details)
            events.append(new_event)
            if (new_event['event_type'] == 'discharge'):
                log_admission(new_event)
                billing_event = generate_billing_event(new_event, event_id + 1)
                log_billing(billing_event)
                events.append(billing_event)
                event_id += 1
                print(json.dumps(billing_event, indent=4))
                producer.send('hospital_events', billing_event)

            if (new_event['event_type'] == 'admission'):
                log_admission(new_event)

            if new_event['event_type'] not in ['admission', 'discharge', 'billing']:
                log_overflow(new_event)

            producer.send('hospital_events', new_event)
            print(json.dumps(new_event, indent=4))
            event_id += 1
            daily_events += 1
            time.sleep(2)
            current_time = datetime.fromisoformat(new_event['timestamp'])
            if current_time >= end_time:
                break
        current_time = datetime.now() - timedelta(days=day)
        day -= 1

    return event_id


# Generate real-time events
print("#########################################################################################")
print("Generate real-time events")
print("#########################################################################################")


def generate_realtime_data(event_id):
    allocated_patients_details, discharged_patients_details, billing_patient = get_current_state()
    last_event = get_last_event()

    while True:
        new_event = generate_event(event_id, datetime.now(), allocated_patients_details, discharged_patients_details)
        # if new_event['event_type'] == "billing":
        #     log_billing(new_event)
        if new_event['event_type'] in ["admission", "discharge"]:
            log_admission(new_event)

        if (new_event['event_type'] == 'discharge'):
            billing_event = generate_billing_event(new_event, event_id + 1)
            events.append(billing_event)
            event_id += 1
            print(json.dumps(billing_event, indent=4))
            producer.send('hospital_events', billing_event)
            log_billing(billing_event)

        if new_event['event_type'] not in ['admission', 'discharge', 'billing']:
            log_overflow(new_event)
        # store_event(new_event)
        producer.send('hospital_events', new_event)
        print(json.dumps(new_event, indent=4))
        event_id += 1
        last_event = new_event
        time.sleep(300)  # Simulate streaming delay


if __name__ == "__main__":
    last_event_id = generate_historical_data()
    generate_realtime_data(last_event_id+1)

