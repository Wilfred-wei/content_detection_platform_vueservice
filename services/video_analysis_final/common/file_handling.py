import os
from werkzeug.utils import secure_filename
from config import Config

def allowed_file(filename, module):
    """检查文件扩展名是否允许"""
    if module == 'module1':
        allowed = Config.MODULE1_ALLOWED_EXTENSIONS
    else:
        allowed = Config.MODULE2_ALLOWED_EXTENSIONS
    
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in allowed

def save_upload_file(file, module):
    """保存上传的文件到指定模块目录"""
    if module == 'module1':
        upload_folder = Config.MODULE1_UPLOAD_FOLDER
    else:
        upload_folder = Config.MODULE2_UPLOAD_FOLDER
    
    if not os.path.exists(upload_folder):
        os.makedirs(upload_folder)
    
    filename = secure_filename(file.filename)
    file_path = os.path.join(upload_folder, filename)
    file.save(file_path)
    
    return filename