from flask import Flask, jsonify
from flask_socketio import SocketIO
from flask_socketio import SocketIO, emit
from kafka import KafkaConsumer
import json
import threading
import sqlalchemy as sa
from sqlalchemy.orm import sessionmaker
from datetime import datetime, timedelta
import logging
from flask import request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})
# CORS(app, resources={r"/socket.io/*": {"origins": "http://localhost:63342"}})
socketio = SocketIO(app, cors_allowed_origins="*")

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Kafka Consumer
consumer = KafkaConsumer('hospital_events', bootstrap_servers=['localhost:9092'],
                         auto_offset_reset='latest', enable_auto_commit=False,
                         group_id='hospital_events_group',
                         value_deserializer=lambda x: json.loads(x.decode('utf-8')))

# Database connection
engine = sa.create_engine(
    'mssql+pyodbc://@4BCGLQ2/Hospital_db?driver=ODBC+Driver+17+for+SQL+Server&Trusted_Connection=yes')
Session = sessionmaker(bind=engine)


# @socketio.on('connect')
# def handle_connect():
#     logger.info("Client connected")
#     emit('Hello122', {'data': 'Connected to server'})

def kafka_consumer():
    logger.info("Starting Kafka consumer")
    for message in consumer:
        data = message.value
        # socketio.emit('hospital_event', data)
        socketio.emit('Hello', data)
        # Store data in SQL Server
        session = Session()
        event = data['details']
        event_id = data['event_id']

        # Check if the event already exists
        existing_event = session.execute(sa.text("""
            SELECT 1 FROM HospitalEvents WHERE event_id = :event_id
        """), {'event_id': event_id}).fetchone()

        if not existing_event:
            new_event = {
                'event_id': event_id,
                'timestamp': datetime.fromisoformat(data['timestamp']),
                'event_type': data['event_type'],
                'patient_id': event.get('patient_id'),
                'department': event.get('department'),
                'bed_id': event.get('bed_id'),
                'admission_reason': event.get('admission_reason'),
                'discharge_summary': event.get('discharge_summary'),
                'billing_amount': event.get('amount'),
                'billing_reason': event.get('billing_reason'),
                'age': event.get('age'),
                'gender': event.get('gender')

            }
            session.execute(sa.text("""
                INSERT INTO HospitalEvents (event_id, timestamp, event_type, patient_id, department, bed_id, 
                                            admission_reason, discharge_summary, billing_amount, billing_reason,age,gender 
                                            )
                VALUES (:event_id, :timestamp, :event_type, :patient_id, :department, :bed_id, 
                        :admission_reason, :discharge_summary, :billing_amount, :billing_reason, 
                        :age, :gender)
            """), new_event)
            session.commit()
            logger.info(f"Stored event {event_id} in database")
        else:
            logger.info(f"Event {event_id} already exists in database")

        session.close()

        consumer.commit()


@app.route('/historical_data', methods=['GET'])
def get_historical_data():
    try:
        session = Session()
        query = """
        SELECT * FROM HospitalEvents
        WHERE event_type = 'admission' or event_type = 'discharge' or event_type = 'billing'
        """
        results = session.execute(sa.text(query)).fetchall()

        historical_data = []
        for row in results:
            historical_data.append({
                'event_id': row.event_id,
                'timestamp': row.timestamp.isoformat(),
                'event_type': row.event_type,
                'details': {
                    'patient_id': row.patient_id,
                    'department': row.department,
                    'bed_id': row.bed_id,
                    'admission_reason': row.admission_reason,
                    'discharge_summary': row.discharge_summary,
                    'amount': row.billing_amount,
                    'billing_reason': row.billing_reason,
                    'age': row.age,
                    'gender': row.gender
                }
            })
        session.close()
        return jsonify(historical_data)
    except Exception as e:
        logger.error(f"Error fetching historical data: {str(e)}")
        return jsonify({"error": "Internal server error"}), 500


@socketio.on('connect')
def handle_connect():
    logger.info('Client connected')


if __name__ == '__main__':
    threading.Thread(target=kafka_consumer, daemon=True).start()
    socketio.run(app, host='0.0.0.0', port=5000)
