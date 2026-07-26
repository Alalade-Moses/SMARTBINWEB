import os
from dotenv import load_dotenv
from datetime import timedelta

load_dotenv()


class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY', 'fallback-development-secret-key')
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY', 'fallback-development-jwt-key')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=24)

    BASE_DIR = os.path.abspath(os.path.dirname(__file__))
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or \
                              f"sqlite:///{os.path.join(BASE_DIR, 'smart_waste.db')}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ECHO = False 

    SCHEDULER_API_ENABLED = True
    SCHEDULER_JOBSTORES = {'default': {'type': 'memory'}}
    SCHEDULER_EXECUTORS = {'default': {'type': 'threadpool', 'max_workers': 20}}
    SCHEDULER_JOB_DEFAULTS = {
        'coalesce': False,
        'max_instances': 3
    }