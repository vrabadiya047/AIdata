# src/manager.py
import os
import shutil
from .config import DATA_DIR, STORAGE_DIR
from .database import (
    add_custom_project, 
    delete_project_data, 
    delete_file_metadata,
    save_file_project
)

def handle_create_project(name, username):
    """Creates a project logically and physically isolated to the user."""
    if not name or name.strip() == "":
        return False
    # 1. Register in Database locked to User
    add_custom_project(name, username)
    
    # 2. Create Physical Data Folder (Nested under username)
    p_dir = os.path.join(DATA_DIR, username, name)
    if not os.path.exists(p_dir):
        os.makedirs(p_dir)
    return True

def handle_delete_project(name, username):
    """Wipes the user's specific project data and AI storage."""
    # 1. Wipe Physical Data Documents
    proj_path = os.path.join(DATA_DIR, username, name)
    if os.path.exists(proj_path):
        shutil.rmtree(proj_path)
    
    # 2. Wipe Physical AI Index storage
    s_path = os.path.join(STORAGE_DIR, username, name)
    if os.path.exists(s_path):
        shutil.rmtree(s_path)
    
    # 3. Wipe Database entries
    delete_project_data(name, username)
    return True

def handle_file_upload(uploaded_file, target_project, username):
    """Saves a file physically isolated to the user."""
    project_dir = os.path.join(DATA_DIR, username, target_project)
    if not os.path.exists(project_dir):
        os.makedirs(project_dir)
        
    file_path = os.path.join(project_dir, uploaded_file.name)
    with open(file_path, "wb") as f:
        f.write(uploaded_file.getbuffer())
        
    # Register in DB tracking the owner
    save_file_project(uploaded_file.name, target_project, username)
    return True

def handle_delete_file(project_name, file_name, username):
    """Removes a file from the user's specific project folder."""
    file_path = os.path.join(DATA_DIR, username, project_name, file_name)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    delete_file_metadata(file_name, username)
    return True

def list_files_in_project(project_name, username):
    """Retrieves files only from the user's isolated folder."""
    proj_path = os.path.join(DATA_DIR, username, project_name)
    if os.path.exists(proj_path):
        return os.listdir(proj_path)
    return []