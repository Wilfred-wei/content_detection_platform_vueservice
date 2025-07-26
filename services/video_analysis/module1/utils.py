from werkzeug.utils import secure_filename
from config import Config

def allowed_file(filename, module_name):
    """检查文件扩展名是否允许"""
    if module_name == 'module1':
        return '.' in filename and \
               filename.rsplit('.', 1)[1].lower() in Config.MODULE1_ALLOWED_EXTENSIONS
    else:
        return '.' in filename and \
               filename.rsplit('.', 1)[1].lower() in Config.MODULE2_ALLOWED_EXTENSIONS