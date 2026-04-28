function isup -d "Check if a URL is up" -a uri
    if curl -s --head --request GET $uri | grep "200 OK" >/dev/null
        echo "$uri is up"
    else
        echo "$uri is down"
    end
end
