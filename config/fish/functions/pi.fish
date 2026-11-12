function pi
    set -lx PATH /opt/homebrew/bin $PATH
    for directory in $PATH
        if string match -q '*/cmux-cli-shims/*' -- $directory; and test -x "$directory/pi"
            "$directory/pi" $argv
            return $status
        end
    end
    /opt/homebrew/bin/pi $argv
end
