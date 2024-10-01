// modes/snake_screensaver.js
module.exports = function snake_screensaver() {
    if (this.page === "snake_screensaver") return;
    clearInterval(this.update_interval);
    this.page = "snake_screensaver";

    let box_pos = [0, 0];
    let count = 0;
    let flip = false;
    let tail = [];
    let tail_max = 25;
    let t_tail_length = 1;
    let random_pickups = [];
    let screen_saver_animation_reset = () => {
        tail = [];
        count = 0;
        t_tail_length = 10;
        random_pickups = [];
        let nb = 7;
        while (nb--) {
            let _x = Math.floor(Math.random() * (this.width));
            let _y = Math.floor(Math.random() * (this.height / 3)) * 3;
            random_pickups.push([_x, _y]);
        }
    }
    screen_saver_animation_reset();
    this.refresh_action = () => {
        this.driver.buffer.fill(0x00);
        let x;
        if (count % this.width == 0) { flip = !flip }
        if (flip) x = count % this.width + 1
        else x = this.width - count % this.width
        let y = ~~(count / this.width) * 3
        tail.push([x, y]);
        if (tail.length > t_tail_length) tail.shift();
        for (let i of tail) {
            this.driver.fillRect(i[0], i[1] - 1, 2, 3, 1);
        }
        for (let r of random_pickups) {
            if (((flip && x >= r[0]) || (!flip && x <= r[0])) && y >= r[1]) {
                t_tail_length += 5;
                random_pickups.splice(random_pickups.indexOf(r), 1)
            }
            this.driver.fillRect(r[0], r[1], 1, 1, 1);
        }
        count++;
        this.driver.update(true);
        if (y > this.height) screen_saver_animation_reset();
    }
    this.update_interval = setInterval(() => { this.refresh_action() }, 40);
}
