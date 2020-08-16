
function fadeAnimation(_window, type, duration, cb = null) {
    if (typeof _window !== 'object') {
        return null;
    }

    const typeOffset = type === 'in' ? 1 : -1;
    const opStep = typeOffset * (1 / duration);
    let opacity = type === 'in' ? 0 : 1;
    let currentFrame = 0;

    const interval = setInterval(() => {
        try {
            _window.setOpacity(opacity);
        
            currentFrame++;
        
            opacity += opStep;
            
            if (currentFrame >= duration) {
                _window.setOpacity(type === 'in' ? 1 : 0);
                clearInterval(interval);
            
                if (typeof cb === 'function') {
                    cb();
                }
            }
        }catch(e){
            if (typeof _window !== 'object') {
                _window.setOpacity(type === 'in' ? 1 : 0);
            }

            clearInterval(interval);

            if (typeof cb === 'function') {
                cb();
            }
        }
    }, 5);

    return interval;
}

module.exports = {
    fadeAnimation: fadeAnimation
}