import sys
import os

# Add parent directory to sys.path so app modules are importable
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from run import app

# Entrypoint for Vercel serverless function
if __name__ == '__main__':
    app.run()
