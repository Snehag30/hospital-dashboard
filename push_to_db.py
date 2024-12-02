from flask import Flask, jsonify
from flask_pymongo import PyMongo
from flask_apscheduler import APScheduler
import logging
from datetime import datetime, timedelta
import json
from pytz import UTC

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)
app.config[
    "MONGO_URI"] = "mongodb+srv://commonuser:commonuser123@cluster0.czzze.mongodb.net/Logs?retryWrites=true&w=majority&tlsAllowInvalidCertificates=true"
mongo = PyMongo(app)

# Initialize scheduler
scheduler = APScheduler()
scheduler.init_app(app)
scheduler.start()

# Variable to store the last processed timestamp
last_processed_timestamp = None


def push_logs_to_mongodb():
    global last_processed_timestamp
    with app.app_context():
        try:
            # Get the current time
            current_time = datetime.now(UTC)

            # If it's the first run, set last_processed_timestamp to 40 seconds ago
            if last_processed_timestamp is None:
                last_processed_timestamp = current_time - timedelta(seconds=40)

            logging.debug(f"Checking for logs between {last_processed_timestamp} and {current_time}")

            logs_to_push = []

            with open('json_logs.log', 'r') as f:
                for line in f:
                    log_entry = json.loads(line)
                    log_timestamp = datetime.fromisoformat(log_entry['Timestamp']).replace(tzinfo=UTC)

                    # Include logs from the last processed timestamp up to now
                    if last_processed_timestamp < log_timestamp <= current_time:
                        logs_to_push.append(log_entry)
                    elif log_timestamp > current_time:
                        logging.warning(f"Found a log with future timestamp: {log_timestamp - current_time}")

            # Update the last processed timestamp
            last_processed_timestamp = current_time

            # Insert logs into MongoDB
            if logs_to_push:
                result = mongo.db.sneha.insert_many(logs_to_push)
                logging.info(f"Inserted {len(result.inserted_ids)} logs into MongoDB")
                for log in logs_to_push:
                    logging.debug(f"Pushed log: {log}")
            else:
                logging.info("No logs to push to MongoDB")

        except Exception as e:
            logging.error(f"Error pushing logs to MongoDB: {str(e)}")


# Function to check log file contents
def check_log_file():
    try:
        with open('json_logs.log', 'r') as f:
            lines = f.readlines()
            logging.debug(f"Total lines in log file: {len(lines)}")
            if lines:
                first_log = json.loads(lines)
                last_log = json.loads(lines[-1])
                logging.debug(f"First log timestamp: {first_log['Timestamp']}")
                logging.debug(f"Last log timestamp: {last_log['Timestamp']}")
    except Exception as e:
        logging.error(f"Error reading log file: {str(e)}")


# Schedule the push_logs_to_mongodb function to run every 30 seconds
scheduler.add_job(id='push_logs_to_mongodb', func=push_logs_to_mongodb, trigger='interval', seconds=30)

# Schedule the check_log_file function to run every 60 seconds
scheduler.add_job(id='check_log_file', func=check_log_file, trigger='interval', seconds=60)


@app.route("/")
def home():
    return "Flask app is running with scheduled log pushing every 30 seconds."


if __name__ == "__main__":
    logging.info("Starting the Flask application with scheduled log pushing...")
    check_log_file()  # Check the log file contents when starting the app
    app.run(debug=True, use_reloader=False, port=5001)  # use_reloader=False to prevent scheduler from running twice
